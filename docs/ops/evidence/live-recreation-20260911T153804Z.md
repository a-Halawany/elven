# Live-container recreation — 2026-09-11 (CP-4a): the deployment moved onto the pinned derived images, with a verified rollback point, without losing anything

**What this is.** The governed recreation of the demonstration deployment's two service containers
(`eye-postgres`, `eye-redis`) onto the images `docker-compose.yml` pins — the temporary derived images
on GHCR with the util-linux/OpenSSL/c-ares fixes and the process protections (`user`, `cap_drop: [ALL]`,
`no-new-privileges`) — after every prerequisite the fourth and fifth drills named was in place:
the operator credential recovered and rotated, the Redis server on the current password, the arm64
disposition accepted by the owner (SCX-0010/0011, `docs/images/ARM64_RISK_DECISION.md` §5), a
backup/rollback point taken from the live deployment **and verified by an isolated restore** before
anything was recreated. The data volume `new_project_eye-pgdata` was reused; nothing was deleted.

**Code head at the time:** `548a0be` (`apps/api/dist` digest `sha256:e85f4b71f320a1c9…`, byte-identical
to the running artifact per the backup's own comparison; migrations through 0057 in the databases).

## 0. Before

| | eye-postgres | eye-redis |
|---|---|---|
| container | `02a9fb981fe7`, started 2026-09-09T06:46:17Z | `fd55ae26a260`, started 2026-09-09T06:46:17Z |
| image | official `postgres@sha256:9a8afca5…` (image id `db676a0ed906`) | official `redis@sha256:978f0e01…` (`fbe100e8c73f`) |
| user / cap_drop / security_opt | `''` / `[]` / `[]` (root, full capabilities) | `''` / `[]` / `[]` |
| health | healthy | **unhealthy, failing streak 5,656** — the container's baked `REDIS_HEALTHCHECK_PASSWORD` predated the 2026-09-10 regeneration of `.eye-local/env`; the server itself answered `PONG` to the current password |

API `/readyz` 200 `ok`; web `/login` 200.

## 1. The rollback point

`scripts/ops/backup.sh` against the live deployment → bundle **R = `$HOME/eye-backups/20260911T153804Z`**
(220,360 KB, 27 s; format `eye-bundle-crypto/2`; build identity `548a0be`, dist `e85f4b71…` — the running
artifact; `runtime-workspace.tar` carried; capture boundary recorded, the live source not quiesced).

## 2. The rollback point, verified

`scripts/ops/restore.sh R --into-isolated` (scheduler phase off; no `--keep`, torn down through its run
manifest): **61 checks, 61 passed**, 49 s — postgres and redis started from the same pinned images with the
process protections, both databases restored (`pg_restore` rc 0, 0 errors), the artifact identified and
verified, schema compatibility at 0057, the governed read (member login → evidence list → download
re-verified) passing, credential recovery 7/7 roles. So the deployment could be rebuilt from R before R
was relied on.

## 3. The recreation

The API and the web shell were stopped; PostgreSQL was checkpointed; then, with the current
`.eye-local/env` read once:

    docker compose up -d --force-recreate --wait      rc=0, 6 s
    Container eye-postgres  Healthy
    Container eye-redis     Healthy

## 4. After

| | eye-postgres | eye-redis |
|---|---|---|
| container | `3569d75b718f`, started 2026-09-11T15:39:23Z | `687ad3e98f96`, started 2026-09-11T15:39:23Z |
| image ref (what compose pins) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` | `ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15` |
| image id | `sha256:be0012863211c75f40ef47d1476f29ecca50f73e5803e7c3da181aaddfef32ff` (the index's `linux/arm64` child, `sha256:d3dd485b…`) | `sha256:6deece17eb4ace79ccc6b65ff9ece991dee07b3136d2df4cd405c63be7046937` |
| user / cap_drop / security_opt | `70:70` / `[ALL]` / `[no-new-privileges:true]` | `999:1000` / `[ALL]` / `[no-new-privileges:true]` |
| PID 1 (`/proc/1/status`) | `postgres`, Uid 70, CapPrm/CapEff/CapBnd `0000000000000000`, NoNewPrivs 1, Seccomp 2 | `redis-server`, Uid 999 Gid 1000, capabilities all zero, NoNewPrivs 1, Seccomp 2 |
| health | healthy | **healthy, failing streak 0** — the stale baked healthcheck variable is gone with the old container |
| volume | `new_project_eye-pgdata` (reused) | — (Redis holds nothing that cannot be rebuilt) |

`eye_demo` on the recreated PostgreSQL: `0057_agent_run_session_follows_progress.sql` the newest migration,
29,625 canonical objects — the same data. Redis: `PONG` on the current password, 0 keys before the API
started.

## 5. The application on the recreated services

The API (`EYE_SCHEDULER_ENABLED=true`) and the web shell restarted: `/readyz` 200
`{"status":"ok","db":true,"audit":"ok","auditIncidents":0}`; `/login` 200; the collection worker
`reconciled 6/6 persisted schedule(s); workers: 1` into the empty Redis (175 keys afterwards); **12 of 12
human principals** (`platform-admin` and the eleven demo personas) log in with the current credential.
The driver's final stage hung on a pipe the restarted API's shell kept open (the API itself was up
throughout); the stage was completed by hand and appended to the log.

## 6. Scheduled collection after the recreation

Reconciling the schedules into an empty Redis makes BullMQ produce each `every` scheduler's first job at
once, so every live source ticked within a minute of the restart — the same behaviour the restore drill
pauses the queues to observe. Six scheduled attempts, all `trigger=scheduler`:

| Source | Outcome | Admitted / confirmed |
|---|---|---|
| `imf-portwatch-chokepoints` | **finished** (15:39:31 → 15:39:38) | 91 / 0 — the daily layer's new rows |
| `eu-sanctions-rss` | **finished** | 1 / 5 |
| `eu-sanctions-payload` | **finished** | 0 / 1 |
| `ecb-eurusd` | **finished** | 12 / 0 |
| `worldbank-indicators` | failed — `egress refused (timeout)` (the publisher's API; retried at its weekly cadence) | — |
| `imf-portwatch-ports` | **finished** (15:40:47 → 15:40:50) | 31 / 0 |

Five successful scheduled collections through the recreated services; one upstream timeout. The
`gdelt-discovery` schedule (a replay-mode source that migration 0038 does not consider eligible) was
NOT rebuilt — its hourly `refused` attempts since the agent re-provisioning (a Redis job still carrying
the previous agent) end with the recreation, as intended.

**Observation, recorded for the register:** a reconciliation into an empty Redis fires one off-cycle
tick per live source. Cadences and budgets are unchanged; the recreation cost one request per source.

## 7. Rollback, had it been needed

Bundle R (verified in §2) restores both databases, the vault, the journal and the configuration; the
previous official images remain pinned in git history (`main:docker-compose.yml`). Neither was needed.

## 8. Transcript

    
    
    ========================================================================
    CP-4a RECREATION 20260911T153803Z — preflight (read-only)
    ========================================================================
    git HEAD: 548a0bec9fa7b8fa67369dd72837e2293310d23f (phase6-decisions); porcelain: 2 path(s)
    apps/api/dist digest: sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372
    compose pins:
      21:    image: ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7 
      57:    image: ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15 
    live containers before:
    eye-redis  Up 2 days (unhealthy)  redis
    eye-postgres  Up 2 days (healthy)  postgres
      eye-postgres: id 02a9fb981fe7 image postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15 imageId sha256:db676a0ed906 started 2026-09-09T06:46:17.198502092Z user '' capdrop [] secopt []
      eye-redis: id fd55ae26a260 image redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241 imageId sha256:fbe100e8c73f started 2026-09-09T06:46:17.204991092Z user '' capdrop [] secopt []
      volume: new_project_eye-pgdata 
      demo API :3401 -> 200 {"status":"ok","db":true,"audit":"ok","auditIncidents":0,"degradedSince":null,"classification":"telemetry-only"}
      web :3000 -> 200
      redis (current env password): PONG
      redis healthcheck streak: unhealthy failing=5656
    
    
    ========================================================================
    STAGE 1 — the rollback point: backup.sh against the LIVE deployment
    ========================================================================
    | 
    | ==> destination guards (physical paths; before any read of the credential file or any write)
    |   protected (physical): /Users/halawany/work/personal/mohammed/new_project /Users/halawany/work/personal/mohammed/new_project/.git /Users/halawany/work/personal/mohammed/new_project/.eye-local /Users/halawany/work/personal/mohammed/new_project/apps/api/.eye-local
    |   source: LIVE — live deployment (/Users/halawany/work/personal/mohammed/new_project)
    |   ok: EYE_BACKUP_ROOT /Users/halawany/eye-backups exists, is a directory and is not a symlink
    |   accepted: EYE_BACKUP_ROOT /Users/halawany/eye-backups (physical /Users/halawany/eye-backups)
    |   accepted: bundle /Users/halawany/eye-backups/20260911T153804Z (physical /Users/halawany/eye-backups/20260911T153804Z)
    | 
    | ==> preflight (read-only against the postgres service's container)
    |   services: postgres -> eye-postgres, redis -> eye-redis
    | 
    | ==> bundle directory (fresh; cleanup on failure is bound to the run manifest)
    |   created: bundle /Users/halawany/eye-backups/20260911T153804Z
    |   bundle: /Users/halawany/eye-backups/20260911T153804Z
    |   repository: /Users/halawany/work/personal/mohammed/new_project @ 548a0bec9fa7b8fa67369dd72837e2293310d23f (phase6-decisions)
    | 
    | ==> build identity: building the API from the committed tree at HEAD with the committed lockfile
    |   accepted: build root /Users/halawany/eye-backups/builds/20260911T153804Z (physical /Users/halawany/eye-backups/builds/20260911T153804Z)
    |   build root: /Users/halawany/eye-backups/builds/20260911T153804Z (fresh; git archive of 548a0bec9fa7, then pnpm install --frozen-lockfile, then pnpm --filter @eye/api... build)
    |   created: build root /Users/halawany/eye-backups/builds/20260911T153804Z (owned by this run: inode 16777233:114110283 recorded)
    |   git sha:        548a0bec9fa7b8fa67369dd72837e2293310d23f  (worktree clean: false)
    |   NOTE: the worktree carries uncommitted changes; the build is of the COMMITTED tree, and the changes are recorded in the manifest:
    |      M evidence/phase6-browser/14-replay.png
    |      M evidence/phase6-browser/15-briefings.png
    |   lockfile:       pnpm-lock.yaml sha256=024f2bbc4debce547f9829027f3701b378b1cc04347f0237a6bdb9189572dfcf (frozen)
    |   toolchain:      node v24.11.1, pnpm 11.9.0 on darwin/arm64
    |   dist digest:    sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372  (367 files, 3193374 bytes)
    |   build window:   2026-09-11T15:38:04Z -> 2026-09-11T15:38:11Z (7.2s)
    |   the deployment's own /Users/halawany/work/personal/mohammed/new_project/apps/api/dist has the SAME digest: the running artifact is this commit's build
    |   api-dist.tar    4365824 bytes (the identified artifact travels with the bundle)
    |   runtime-workspace.tar 290304 bytes (lockfile sha256 024f2bbc4debce547f9829027f3701b378b1cc04347f0237a6bdb9189572dfcf, workspace manifests, packages/contracts/dist)
    | 
    | ==> capture boundary (before the dumps): snapshot ids, audit heads, newest blob manifest, vault listing digest
    |   eye: xmin=452568 xmax=452568 audit_events=118009 manifests=11421 newest_manifest=2026-09-11T15:02:15.889329+00:00
    |   eye_demo: xmin=452568 xmax=452568 audit_events=48473 manifests=13675 newest_manifest=2026-09-11T14:58:45.258655+00:00
    |   vault: files=21234 bytes=57972515 listing_digest=d3fc7c873371cc49…
    |   NOT quiesced: the source keeps admitting while the window is open; restore reconciles against this boundary
    | 
    | ==> recording database facts before the dumps
    |   eye: migrations=57 last=0057_agent_run_session_follows_progress.sql canonical_objects=32159 audit_events=118009 partitions=644 manifests={"evidence":11421} tombstones=72
    |   eye_demo: migrations=57 last=0057_agent_run_session_follows_progress.sql canonical_objects=29625 audit_events=48473 partitions=2 manifests={"quarantine":4,"evidence":13671} tombstones=1
    | 
    | ==> pg_dump -Fc (streamed to host)
    |   pg/eye.dump  70066140 bytes  4s
    |   pg/eye_demo.dump  28827320 bytes  2s
    | 
    | ==> pg_dumpall --globals-only (roles and their password verifiers; treated as secret material)
    |   pg/globals.sql  2879 bytes  roles: 9
    | 
    | ==> recording database facts after the dumps (drift detection; the demo collects hourly)
    |   eye: unchanged during the dump window
    |   eye_demo: unchanged during the dump window
    | 
    | ==> vault.tar (.eye-local/vault, paths relative to the source root /Users/halawany/work/personal/mohammed/new_project)
    |   vault.tar  121652224 bytes  files=21234 payload_bytes=57972515
    | 
    | ==> journal.tar (degraded-audit journals)
    |   apps/api/.eye-local/degraded-demo: present, files=0
    |   apps/api/.eye-local/degraded: absent under /Users/halawany/work/personal/mohammed/new_project (this source has not journalled a degraded state there)
    |   journal.tar  3584 bytes
    | 
    | ==> config/env (byte copy, 0600 — never displayed)
    |   config/env  1062 bytes  keys=14
    | 
    | ==> capture boundary (after every artefact): the closing edge of the window
    |   eye: the boundary did not move during the window
    |   eye_demo: the boundary did not move during the window
    |   vault: unchanged during the window (21234 files)
    |   GUARANTEE: the window is coherent — nothing was admitted between the first and the last artefact
    | 
    | ==> image pins and process protections (by compose service identity) and what the running containers carry
    |   postgres: pin ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7
    |     declared protections: user=70:70 cap_drop=["ALL"] security_opt=["no-new-privileges:true"]
    |     running: postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15  pin_matches=false pin_digest_matches=false
    |     running protections: user=(none) cap_drop=[] security_opt=[]  match_declared=false
    |     NOTE: the running container does not carry the pinned digest (it has not been recreated since the re-pin); the pin above is what a restore starts from
    |   redis: pin ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15
    |     declared protections: user=999:1000 cap_drop=["ALL"] security_opt=["no-new-privileges:true"]
    |     running: redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241  pin_matches=false pin_digest_matches=false
    |     running protections: user=(none) cap_drop=[] security_opt=[]  match_declared=false
    |     NOTE: the running container does not carry the pinned digest (it has not been recreated since the re-pin); the pin above is what a restore starts from
    | 
    | ==> MANIFEST.json
    | 
    | ==> sealing the bundle (AES-256-GCM; per-bundle key wrapped under EYE_BACKUP_PASSPHRASE)
    |   cipher: aes-256-gcm; key derivation: PBKDF2-HMAC-SHA512 x600000; the key itself is nowhere on disk
    |   sealed pg/eye.dump (70066140 bytes plaintext)
    |   sealed pg/eye_demo.dump (28827320 bytes plaintext)
    |   sealed pg/globals.sql (2879 bytes plaintext)
    |   sealed vault.tar (121652224 bytes plaintext)
    |   sealed journal.tar (3584 bytes plaintext)
    |   sealed config/env (1062 bytes plaintext)
    |   sealed api-dist.tar (4365824 bytes plaintext)
    |   sealed runtime-workspace.tar (290304 bytes plaintext)
    |   verified: every sealed file authenticates and decrypts to its recorded plaintext sha256
    | 
    | bundle complete: /Users/halawany/eye-backups/20260911T153804Z  (220360 KB, 27s)
    |   source: live deployment (/Users/halawany/work/personal/mohammed/new_project)
    |   pg/eye.dump  plaintext sha256=137adf7664e2292ecdeb87e08a5ce54f071c5bcebb6215021c4901fd0e7c1d77  bytes=70066140  (stored as pg/eye.dump.enc)
    |   pg/eye_demo.dump  plaintext sha256=45b72b49ce6f40fa452a4556c36e4bf58703642c8baef1c6f4740268fd563676  bytes=28827320  (stored as pg/eye_demo.dump.enc)
    |   pg/globals.sql  plaintext sha256=2e2e273cb7337027f9ec77ed44cd79b439b543cddcc510bcc7976c7e11588961  bytes=2879  (stored as pg/globals.sql.enc)
    |   vault.tar  plaintext sha256=05f2e968ce9c28b184eab4a4dc9900ce6bc6ac0ec7408a680d2e8e2d73583f99  bytes=121652224  (stored as vault.tar.enc)
    |   journal.tar  plaintext sha256=efa74ef06721fe28bdd706f72eba1a32ae633d5c63f98fe2daf7e98fc584022d  bytes=3584  (stored as journal.tar.enc)
    |   config/env  plaintext sha256=06ace7fa13cd67abae1cff0a2e95e88d0e872e8cb0fe2d20cbe95d4895a8e2e5  bytes=1062  (stored as config/env.enc)
    |   api-dist.tar  plaintext sha256=13b53002d09a2e5a341fd72fbdc1ad10bbd0a8cb2a1aec75da65ff841d7fa5ae  bytes=4365824  (stored as api-dist.tar.enc)
    |   runtime-workspace.tar  plaintext sha256=9cdc4ddfd51081d1c1aea97192eaa82c277f610de8d164adc9bb7145a5a0b1e1  bytes=290304  (stored as runtime-workspace.tar.enc)
    |   MANIFEST.json  sha256=76ddcf0ca1bf2ce936845435ddaeff2249a2d2cf355ae6a8e8b3f0e338a1de28  (in the clear: it holds no secret)
    |   RUN.json  created: dir,dir,dir,dir
    |   build: 548a0bec9fa7 -> sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372
    | 
    | TO RESTORE THIS BUNDLE YOU NEED: the bundle directory AND the passphrase it was sealed with.
    | Neither is derivable from the other. If the passphrase is lost the bundle cannot be opened by anyone.
    stage 1: rc=0 in 28s; rollback bundle R = /Users/halawany/eye-backups/20260911T153804Z
    
    
    ========================================================================
    STAGE 2 — the rollback point is VERIFIED: restore R into an isolated environment (torn down afterwards)
    ========================================================================
    | 
    | ==> bundle /Users/halawany/eye-backups/20260911T153804Z (eye-backup-bundle/2, created 20260911T153804Z, git 548a0bec9fa7, source: live deployment (/Users/halawany/work/personal/mohammed/new_project))
    |   encryption: aes-256-gcm, key wrapped under PBKDF2-HMAC-SHA512 x600000
    |   ok   pg/eye.dump  authenticated
    |   ok   pg/eye_demo.dump  authenticated
    |   ok   pg/globals.sql  authenticated
    |   ok   vault.tar  authenticated
    |   ok   journal.tar  authenticated
    |   ok   config/env  authenticated
    |   ok   api-dist.tar  authenticated
    |   ok   runtime-workspace.tar  authenticated
    |   every sealed file authenticates under the passphrase and decrypts to its recorded plaintext sha256
    | 
    | ==> isolation preflight: destination guards (physical paths; before any chmod, copy, extraction or container start)
    |   protected (physical): /Users/halawany/work/personal/mohammed/new_project /Users/halawany/work/personal/mohammed/new_project/.git /Users/halawany/work/personal/mohammed/new_project/.eye-local /Users/halawany/work/personal/mohammed/new_project/apps/api/.eye-local /Users/halawany/eye-backups/20260911T153804Z
    |   ok: restore root parent /Users/halawany/eye-restore exists, is a directory and is not a symlink
    |   accepted: restore root /Users/halawany/eye-restore/20260911T153832Z (physical /Users/halawany/eye-restore/20260911T153832Z)
    |   created: restore root /Users/halawany/eye-restore/20260911T153832Z
    | 
    | ==> decrypting the sealed bundle into /Users/halawany/eye-restore/20260911T153832Z/plain (0700; the bundle itself is not written to)
    |   opened pg/eye.dump  70066140 bytes  sha256=137adf7664e2292ecdeb87e08a5ce54f071c5bcebb6215021c4901fd0e7c1d77
    |   opened pg/eye_demo.dump  28827320 bytes  sha256=45b72b49ce6f40fa452a4556c36e4bf58703642c8baef1c6f4740268fd563676
    |   opened pg/globals.sql  2879 bytes  sha256=2e2e273cb7337027f9ec77ed44cd79b439b543cddcc510bcc7976c7e11588961
    |   opened vault.tar  121652224 bytes  sha256=05f2e968ce9c28b184eab4a4dc9900ce6bc6ac0ec7408a680d2e8e2d73583f99
    |   opened journal.tar  3584 bytes  sha256=efa74ef06721fe28bdd706f72eba1a32ae633d5c63f98fe2daf7e98fc584022d
    |   opened config/env  1062 bytes  sha256=06ace7fa13cd67abae1cff0a2e95e88d0e872e8cb0fe2d20cbe95d4895a8e2e5
    |   opened api-dist.tar  4365824 bytes  sha256=13b53002d09a2e5a341fd72fbdc1ad10bbd0a8cb2a1aec75da65ff841d7fa5ae
    |   opened runtime-workspace.tar  290304 bytes  sha256=9cdc4ddfd51081d1c1aea97192eaa82c277f610de8d164adc9bb7145a5a0b1e1
    |   PASS  decrypted api-dist.tar has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted config/env has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted journal.tar has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted pg/eye.dump has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted pg/eye_demo.dump has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted pg/globals.sql has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted runtime-workspace.tar has the plaintext sha256 MANIFEST.json records
    |   PASS  decrypted vault.tar has the plaintext sha256 MANIFEST.json records
    | 
    | ==> isolation preflight: names, ports, build output
    |   resources to create: eye-restore-pg (:55433, volume eye-restore-pgdata), eye-restore-redis (:56379), API :3402
    |   the application artifact is chosen and VERIFIED below (build identity), not assumed from apps/api/dist
    | 
    | ==> image identity: the bundle's recorded pins (by compose service identity)
    |   REPORT: at backup time the source container eye-postgres ran postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15 — not the compose pin; the restore starts from the pin (the deployment's declared image)
    |   REPORT: at backup time the source container eye-redis ran redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241 — not the compose pin; the restore starts from the pin (the deployment's declared image)
    |   ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7 -> local image sha256:be0012863211c75f40ef47d1476f29ecca50f73e5803e7c3da181aaddfef32ff (repo digests carry sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7; image USER 'postgres', linux/arm64, created 2026-09-10T16:26:50.703637603Z)
    |   ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15 -> local image sha256:6deece17eb4ace79ccc6b65ff9ece991dee07b3136d2df4cd405c63be7046937 (repo digests carry sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15; image USER 'redis', linux/arm64, created 2026-09-10T16:26:55.965222044Z)
    |   PASS  bundle pins equal the compose file of the source revision 548a0bec9fa7 (postgres same; redis same)
    |   current docker-compose.yml pins the same images (report only)
    |   restore root: /Users/halawany/eye-restore/20260911T153832Z
    |   postgres: ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7
    |   redis:    ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15
    | 
    | ==> process protections for the isolated containers (compose user / cap_drop / security_opt)
    |   postgres: user=70:70 cap_drop=["ALL"] security_opt=["no-new-privileges:true"]  (from: bundle (compose.services.postgres at backup time))
    |     docker run flags: --user 70:70 --cap-drop ALL --security-opt no-new-privileges:true
    |   redis: user=999:1000 cap_drop=["ALL"] security_opt=["no-new-privileges:true"]  (from: bundle (compose.services.redis at backup time))
    |     docker run flags: --user 999:1000 --cap-drop ALL --security-opt no-new-privileges:true
    | 
    | ==> config/env -> /Users/halawany/eye-restore/20260911T153832Z/config/env (0600)
    |   keys=14 (values never displayed)
    | 
    | ==> eye-restore-pg from the bundle's pin ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7 (with the declared process protections)
    |   container afa1d2e3a00a recorded in RUN.json; image in use: ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7 (image id sha256:be0012863211c75f40ef47d1476f29ecca50f73e5803e7c3da181aaddfef32ff)
    |   ready: PostgreSQL 18.4 on aarch64-unknown-linux-musl
    |   PASS  restored server major 18 equals the dump's source server major (source 18.4, restored 18.4)
    | 
    | ==> process protections observed in eye-restore-pg (/proc/1/status inside the container)
    |   HostConfig: {"user":"70:70","cap_drop":["ALL"],"security_opt":["no-new-privileges:true"]}
    |   PID 1:      Name: postgres;Uid: 70 70 70 70;Gid: 70 70 70 70;CapPrm: 0000000000000000;CapEff: 0000000000000000;CapBnd: 0000000000000000;NoNewPrivs: 1;Seccomp: 2
    |   child 51: Name: postgres;Uid: 70 70 70 70;Gid: 70 70 70 70;CapPrm: 0000000000000000;CapEff: 0000000000000000;CapBnd: 0000000000000000;NoNewPrivs: 1;Seccomp: 2
    |   PASS  postgres: PID 1 runs as uid 70 gid 70 (declared user 70:70)
    |   PASS  postgres: PID 1 CapBnd 0000000000000000 CapEff 0000000000000000 (cap_drop ALL declared: both must be 0)
    |   PASS  postgres: PID 1 NoNewPrivs 1 (no-new-privileges:true declared: must be 1)
    | 
    | ==> pg/globals.sql (roles; the superuser already exists in the fresh cluster — that one error is expected)
    |     ERROR:  role "eye" already exists
    |   roles now: eye,eye_app,eye_audit_allocator,eye_commit,eye_identity,eye_publisher,eye_recovery,eye_system,eye_verifier
    |   PASS  globals restored (1 error(s); at most the pre-existing superuser role)
    | 
    | ==> pg_restore pg/eye.dump -> eye
    |   pg_restore rc=0 errors=0  19s
    |   PASS  pg_restore eye completed without error
    | 
    | ==> pg_restore pg/eye_demo.dump -> eye_demo
    |   pg_restore rc=0 errors=0  7s
    |   PASS  pg_restore eye_demo completed without error
    | 
    | ==> credential recovery: does the bundle's config/env actually OPEN the roles the bundle restores?
    |   roles restored from pg/globals.sql that can log in: eye eye_app eye_commit eye_identity eye_publisher eye_recovery eye_verifier
    |   roles restored NOLOGIN by design (SET ROLE targets, never authenticated directly): eye_audit_allocator eye_system
    |   eye  authenticated
    |   eye_app  authenticated
    |   eye_commit  authenticated
    |   eye_identity  authenticated
    |   eye_publisher  authenticated
    |   eye_recovery  authenticated
    |   eye_verifier  authenticated
    |   PASS  every LOGIN role restored from pg/globals.sql is opened by the credentials in the bundle's config/env (7 authenticated, 0 refused, 0 without a credential in the bundle)
    | 
    | ==> vault.tar and journal.tar -> /Users/halawany/eye-restore/20260911T153832Z
    |   PASS  vault files extracted: 21234 (manifest 21234)
    |   journal apps/api/.eye-local/degraded-demo: 0 file(s)
    |   degraded journal for the restored API: /Users/halawany/eye-restore/20260911T153832Z/apps/api/.eye-local/degraded-demo (0 record(s) restored from the bundle)
    | 
    | ==> application artifact: the build this bundle identifies
    |   the bundle identifies: git 548a0bec9fa7, dist sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372 (367 files)
    |   built with: node v24.11.1, pnpm 11.9.0, pnpm-lock.yaml sha256 024f2bbc4debce547f9829027f3701b378b1cc04347f0237a6bdb9189572dfcf
    |   build window: 2026-09-11T15:38:04Z -> 2026-09-11T15:38:11Z
    |   note: the source worktree was NOT clean at build time; the build was of the committed tree at 548a0bec9fa7. Uncommitted at the time:
    |      M evidence/phase6-browser/14-replay.png
    |      M evidence/phase6-browser/15-briefings.png
    |   bundled artifact: {"verdict":"identical","computed_digest":"sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372","computed_files":367}
    |   PASS  the artifact carried in api-dist.tar has the digest MANIFEST.json records (sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372)
    |   starting from: the build root recorded in the bundle (/Users/halawany/eye-backups/builds/20260911T153804Z/src/apps/api) — self-contained: the verified dist AND the node_modules of the frozen-lockfile install
    |   PASS  the target host's own /Users/halawany/work/personal/mohammed/new_project/apps/api/dist is the SAME build as the bundle's (sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372) — this restore is not an upgrade
    | 
    | ==> verification: schema_migrations, canonical_objects, manifests against MANIFEST.json
    |   PASS  eye.schema_migrations_count = 57
    |   PASS  eye.last_migration = 0057_agent_run_session_follows_progress.sql
    |   PASS  eye.canonical_objects = 32159
    |   PASS  eye.audit_events = 118009
    |   PASS  eye.audit_seals = 82
    |   PASS  eye.integrity_incidents = 66
    |   PASS  eye.audit_partitions = 644
    |   PASS  eye.blob_manifests_live = 11349
    |   PASS  eye.blob_tombstones = 72
    |   PASS  eye_demo.schema_migrations_count = 57
    |   PASS  eye_demo.last_migration = 0057_agent_run_session_follows_progress.sql
    |   PASS  eye_demo.canonical_objects = 29625
    |   PASS  eye_demo.audit_events = 48473
    |   PASS  eye_demo.audit_seals = 0
    |   PASS  eye_demo.integrity_incidents = 0
    |   PASS  eye_demo.audit_partitions = 2
    |   PASS  eye_demo.blob_manifests_live = 13674
    |   PASS  eye_demo.blob_tombstones = 1
    |   PASS  eye: the restored schema ends at 0057_agent_run_session_follows_progress.sql, the migration the artifact's tree ends at (57 migrations at git 548a0bec9fa7) — compatible
    |   PASS  eye_demo: the restored schema ends at 0057_agent_run_session_follows_progress.sql, the migration the artifact's tree ends at (57 migrations at git 548a0bec9fa7) — compatible
    | 
    | ==> verification: audit chain (read-only re-computation of every partition; the app's verifyChain rules, without opening incidents)
    |   eye: {"partitions":644,"events_checked":118008,"unfrozen":600,"unfrozen_ok":600,"frozen":44,"frozen_ok":0,"frozen_classes":{"chain_broken":32,"noncanonical_bytes":11,"orphan_rows":1},"heads_equal_manifest":644,"manifest_partitions_missing":0,"unfrozen_failures":[]}
    |   PASS  eye: every unfrozen partition verifies to its head (600/600; 118008 events re-hashed)
    |   PASS  eye: frozen partitions (with recorded integrity incidents in the source) restored as frozen: 44 (manifest 44)
    |   PASS  eye: all 644 chain heads equal the manifest
    |   PASS  eye: audit.rebuild_chain_heads() would change 0 unfrozen heads (0) — the heads are consistent with the ledger
    |   eye_demo: {"partitions":2,"events_checked":48473,"unfrozen":2,"unfrozen_ok":2,"frozen":0,"frozen_ok":0,"frozen_classes":{},"heads_equal_manifest":2,"manifest_partitions_missing":0,"unfrozen_failures":[]}
    |   PASS  eye_demo: every unfrozen partition verifies to its head (2/2; 48473 events re-hashed)
    |   PASS  eye_demo: frozen partitions (with recorded integrity incidents in the source) restored as frozen: 0 (manifest 0)
    |   PASS  eye_demo: all 2 chain heads equal the manifest
    |   PASS  eye_demo: audit.rebuild_chain_heads() would change 0 unfrozen heads (0) — the heads are consistent with the ledger
    | 
    | ==> verification: every live (non-tombstoned) blob manifest has its bytes in the restored vault with the recorded sha256 (ALL rows)
    |   eye: {"total":11349,"present_verified":5735,"absent":5614,"digest_mismatch":0,"length_mismatch":0,"by_vault":{"evidence":{"total":11349,"present_verified":5735,"absent":5614}}}
    |   PASS  eye: no corrupt bytes (5735/11349 present and verified; absent=5614 — the harness database's blobs were written to per-test temporary vault roots, see the runbook)
    |   eye_demo: {"total":13674,"present_verified":13674,"absent":0,"digest_mismatch":0,"length_mismatch":0,"by_vault":{"evidence":{"total":13671,"present_verified":13671,"absent":0},"quarantine":{"total":3,"present_verified":3,"absent":0}}}
    |   PASS  eye_demo: 13674/13674 live manifests have their bytes with the recorded sha256 (absent=0 digest_mismatch=0 length_mismatch=0)
    | 
    | ==> capture-boundary reconciliation: what the source admitted after the boundary the bundle records
    |   boundary: before the dumps at 2026-09-11T15:38:13Z
    |   window:   COHERENT — the boundary did not move between the first and the last artefact
    |   eye: 1 audit event(s) and 0 blob manifest(s) admitted after the boundary; of the live ones 0/0 have their bytes in the bundle, 0 do not
    |   PASS  eye: every row admitted after the capture boundary is enumerated (1 audit event(s), 0 manifest(s); 0 without bytes in the bundle, named above)
    |   eye_demo: 0 audit event(s) and 0 blob manifest(s) admitted after the boundary; of the live ones 0/0 have their bytes in the bundle, 0 do not
    |   PASS  eye_demo: every row admitted after the capture boundary is enumerated (0 audit event(s), 0 manifest(s); 0 without bytes in the bundle, named above)
    | 
    | ==> verification: vault.tar and journal.tar sha256 equal the manifest (re-checked after extraction)
    |   PASS  vault.tar sha256 = 05f2e968ce9c28b184eab4a4dc9900ce6bc6ac0ec7408a680d2e8e2d73583f99
    |   PASS  journal.tar sha256 = efa74ef06721fe28bdd706f72eba1a32ae633d5c63f98fe2daf7e98fc584022d
    | 
    | ==> eye-restore-redis from the bundle's pin ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15 (empty — no Redis state is restored; with the declared process protections)
    |   container 27178edd55b7 recorded in RUN.json; image in use: ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15 (image id sha256:6deece17eb4ace79ccc6b65ff9ece991dee07b3136d2df4cd405c63be7046937)
    |   keys in the fresh redis: 0
    |   PASS  the isolated Redis starts EMPTY — no Redis state is restored from the bundle (0 keys)
    | 
    | ==> process protections observed in eye-restore-redis (/proc/1/status inside the container)
    |   HostConfig: {"user":"999:1000","cap_drop":["ALL"],"security_opt":["no-new-privileges:true"]}
    |   PID 1:      Name: redis-server;Uid: 999 999 999 999;Gid: 1000 1000 1000 1000;CapPrm: 0000000000000000;CapEff: 0000000000000000;CapBnd: 0000000000000000;NoNewPrivs: 1;Seccomp: 2
    |   PASS  redis: PID 1 runs as uid 999 gid 1000 (declared user 999:1000)
    |   PASS  redis: PID 1 CapBnd 0000000000000000 CapEff 0000000000000000 (cap_drop ALL declared: both must be 0)
    |   PASS  redis: PID 1 NoNewPrivs 1 (no-new-privileges:true declared: must be 1)
    | 
    | ==> second API: dist/main.js on :3402 against eye_demo@127.0.0.1:55433, vault+journal under /Users/halawany/eye-restore/20260911T153832Z, scheduler disabled
    |   [eye-api] listening on :3402 (env=local)
    |   scheduler disabled: no collection worker started, persisted schedules not reconciled
    |   /readyz: {"status":"ok","db":true,"audit":"ok","auditIncidents":0,"degradedSince":null,"classification":"telemetry-only"}
    |   degraded journal replayed by this script: {"records":0,"unreconciled":0,"since":null}
    |   PASS  /readyz reports the restored database reachable (db=true)
    |   PASS  /readyz status ok (db=true audit=ok) — the bundle carried no unreconciled degradation
    | 
    | ==> governed read through the restored API (login -> evidence list -> one evidence download re-verified against the restored vault)
    |   {"api":"http://127.0.0.1:3402","tenant":"01a084f5…","domain":"01a084f5…","list":{"status":201,"evidence":20},"download":{"status":201,"evd":"01a090fa…","byteLength":3934,"contentDigest":"95ec14d917de24c4…","bytesHashToDigest":true,"integrity":"verified"},"ok":true}
    |   PASS  governed read: login as demo member, evidence list, evidence download with digest re-verified
    | 
    | ==> summary
    |   restore (postgres start + globals + pg_restore x2 + tar extract): 33s
    |   verification: 10s   total including both APIs, the probe and the scheduler phase: 46s
    |   artifact:     identified — git 548a0bec9fa7, dist sha256:e85f4b71f320a1c9e6c7e64df694aca2fedee5e0d4bc575423de9318bbe86372
    |   degraded:     the bundle carried no unreconciled degradation
    |   boundary:     eye: 1 event(s)/0 manifest(s) after it, 0 without bytes; eye_demo: 0 event(s)/0 manifest(s) after it, 0 without bytes
    |   scheduler:    phase skipped
    |   credentials: 7 role(s) opened by the bundle's config/env, 0 refused
    |   checks: 61 passed, 0 failed
    |   RESTORE VERIFIED
    | 
    | ==> teardown (bound to /Users/halawany/eye-restore/20260911T153832Z/RUN.json)
    |   removed container afa1d2e3a00a036cee403fcf7d270e895c536dcc29d16679c2702967848dd24a (eye-restore-pg)
    |   removed container 27178edd55b716adc2bca7e191d5281214d11b12b1dd8239bbbd457f5cc60b2c (eye-restore-redis)
    |   removed volume eye-restore-pgdata
    |   restore root /Users/halawany/eye-restore/20260911T153832Z (RUN.json, RESTORE_REPORT.json, api.log, work files, config copy) and the bundle are kept
    stage 2: rc=0 in 49s; checks {"passed":61,"failed":0}
    
    
    ========================================================================
    STAGE 3 — stop the application, recreate the containers on the pinned images (volume reused)
    ========================================================================
      API :3401 after stop -> 000
      postgres: checkpoint before the stop (a clean shutdown of the data directory):
        CHECKPOINT
        checkpointed at 2026-09-11 15:39:23.260293+00
    |  Container eye-redis  Recreate
    |  Container eye-postgres  Recreate
    |  Container eye-postgres  Recreated
    |  Container eye-redis  Recreated
    |  Container eye-postgres  Starting
    |  Container eye-redis  Starting
    |  Container eye-redis  Started
    |  Container eye-postgres  Started
    |  Container eye-postgres  Waiting
    |  Container eye-redis  Waiting
    |  Container eye-postgres  Healthy
    |  Container eye-redis  Healthy
    stage 3: docker compose up -d --force-recreate --wait rc=0 in 6s
    eye-postgres  Up 5 seconds (healthy)  ghcr.io/a-halawany/elven/postgres
    eye-redis  Up 5 seconds (healthy)  ghcr.io/a-halawany/elven/redis
    
    
    ========================================================================
    STAGE 4 — the recreated services: digests, health, process protections
    ========================================================================
    eye-postgres:
      id 3569d75b718f started 2026-09-11T15:39:23.963880629Z health healthy (failing streak 0)
      image ref ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7
      image id  sha256:be0012863211c75f40ef47d1476f29ecca50f73e5803e7c3da181aaddfef32ff  repo digests ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7, ghcr.io/a-halawany/elven/postgres@sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc
      user '70:70' cap_drop [ALL] security_opt [no-new-privileges:true]
      PID 1: Name: postgres;Uid: 70 70 70 70;Gid: 70 70 70 70;CapPrm: 0000000000000000;CapEff: 0000000000000000;CapBnd: 0000000000000000;NoNewPrivs: 1;Seccomp: 2;
    eye-redis:
      id 687ad3e98f96 started 2026-09-11T15:39:23.963081295Z health healthy (failing streak 0)
      image ref ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15
      image id  sha256:6deece17eb4ace79ccc6b65ff9ece991dee07b3136d2df4cd405c63be7046937  repo digests ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15
      user '999:1000' cap_drop [ALL] security_opt [no-new-privileges:true]
      PID 1: Name: redis-server;Uid: 999 999 999 999;Gid: 1000 1000 1000 1000;CapPrm: 0000000000000000;CapEff: 0000000000000000;CapBnd: 0000000000000000;NoNewPrivs: 1;Seccomp: 2;
    volume after: new_project_eye-pgdata 
    postgres accepts the current credential: ok: eye_demo at 0057_agent_run_session_follows_progress.sql, 29625 canonical objects
    redis accepts the current credential: PONG; keys: 0
    
    
    ========================================================================
    STAGE 5 — the application on the recreated services: API (scheduler on), web shell
    ========================================================================
    | dist already built at this head; no rebuild
    | {"status":"ok","db":true,"audit":"ok","auditIncidents":0,"de
    | 
    == STAGE 5 (completed by hand after the driver's pipe hung on the restarted API's inherited descriptor; the API itself was up throughout) ==
      API /readyz -> 200 {"status":"ok","db":true,"audit":"ok","auditIncidents":0,"degradedSince":null,"classification":"telemetry-only"}
      web /login  -> 200
      scheduler reconciliation (API log): reconciled 6/6 persisted schedule(s); workers: 1
      application access (governed): 12 of 12 principals log in with the current credential
      eye-redis health: healthy failing=0  eye-postgres health: healthy
      redis keys after reconciliation: 175
    recreation finished at 2026-09-11T15:46:47Z; rollback bundle R = /Users/halawany/eye-backups/20260911T153804Z
