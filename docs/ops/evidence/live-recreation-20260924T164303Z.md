# Live-container recreation — 2026-09-24: the demonstration deployment returned to the OFFICIAL image pins

**What this is.** The recreation of the demonstration deployment's two service containers (`eye-postgres`, `eye-redis`) from
the temporary derived images (2026-09-11, `live-recreation-20260911T153804Z.md`) onto the official images that `main`'s
`docker-compose.yml` has pinned since the C15 return (#57 → `870b212`; the six SCX re-issues approved 2026-09-23), with the same
process protections. Authorised by the owner on 2026-09-24 ("returning the existing demo containers to the accepted official image
pins under the report's backup, restore-check and rollback conditions" — the bounded B21 review, `audit/reviews/
The_Eye_a2303ff_B21_Review_and_B22_Delivery.md`). The data volume `new_project_eye-pgdata` was reused; nothing was deleted; no
new hosting, resource or budget.

**Code at the time:** `main` `5165a97` (#59 merged); the running API artifact is the B21 build (`apps/api/dist` of `a2303ff` — the
same source as `5165a97`); `eye_demo` through migration 0081.

## 0. Before (read-only preflight, 16:43Z)

| | eye-postgres | eye-redis |
|---|---|---|
| container | `3569d75b718f`, started 2026-09-11T15:39:23Z | `687ad3e98f96`, started 2026-09-11T15:39:23Z |
| image | derived `ghcr.io/a-halawany/elven/postgres@sha256:69a974ae…` (id `be0012863211`), PostgreSQL 18.4 | derived `ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24…` (id `6deece17eb4a`) |
| user / cap_drop / security_opt | `70:70` / `[ALL]` / `[no-new-privileges:true]` | `999:1000` / `[ALL]` / `[no-new-privileges:true]` |
| health | healthy | healthy |

API `:3401` `/readyz` `ok` on `eye_demo`; the web shell on :3000 was not running.

## 1. The rollback point — a DEVIATION from the runbook's tool, stated

The runbook's `scripts/ops/backup.sh` seals every bundle under `EYE_BACKUP_PASSPHRASE`, the operator's passphrase kept in the
operator's password store. It is not on this host (no `eye-backup` keychain item) and was not searched for. The backup was
therefore taken the way the B18–B21 acts took theirs — `pg_dump` into the durable, git-ignored `.eye-local/backups/` (never the
scratchpad) — NOT sealed:

`.eye-local/backups/containers-return-20260924T164303Z/` (0700; files 0600): `eye_demo.dump` (52.8 MB, `a9e6987a46f22745…`),
`eye.dump` (73.4 MB, `fae014cc31a3aa2c…`), `globals.sql` (roles and their SCRAM verifiers, `1e4c217aaf7b17f7…`), `SHA256SUMS`,
`preflight.txt` (the full transcript of this operation). The vault roots, the degraded journal and `.eye-local/env` are host
files the recreation does not touch; they were not copied. Captured live (the scheduler running), not quiesced.

## 2. The rollback point, verified in isolation ON THE TARGET IMAGES

A throw-away PostgreSQL from `postgres@sha256:77f58511…` (the official index; PostgreSQL 18.6, linux/arm64 child `d7a8005067f5`)
and a Redis from `redis@sha256:ba6e394f…` (`675f7644831d`), both under the compose protections — observed in `/proc/1/status`:
PostgreSQL uid/gid 70, Redis uid 999 / gid 1000, CapEff and CapBnd `0000000000000000`, NoNewPrivs 1 — on a fresh volume and
loopback ports 55433 / 56379:

- `globals.sql` applied; `pg_restore` of `eye_demo` rc 0 and of `eye` rc 0 (≈ 43 s);
- the restored `eye_demo` EQUAL to the live source: 81 migrations (newest `0081_b21_fitness_coherence_challenge.sql`, the
  filename+digest list's md5 `6ff9dfe6…`), 30,999 canonical objects, 104,291 audit events (the sum of the partitions' chain heads
  104,291), 73 principals, 14,573 outbox rows, 75,984 custody events, 9 `eye*` roles;
- a second API from the running artifact on :3402 (scheduler off, its own degraded directory) over the restored copy and the
  isolated Redis: `/readyz` ok; **21/21 human principals authenticate**; `twins/list` 201 (t. nakamura, 1 twin); `evidence/list`
  201 (a. hoffmann, 100 rows);
- torn down: the API stopped, both containers and the volume removed.

So the deployment could be rebuilt from the backup on the target images before the live containers were touched.

## 3. The recreation (16:46Z)

The demonstration API on :3401 stopped; `CHECKPOINT` on `eye_demo`; then, with `.eye-local/env` read once:

    docker compose up -d --force-recreate --wait postgres redis      rc 0, 7 s
    Container eye-postgres  Healthy
    Container eye-redis     Healthy

## 4. After

| | eye-postgres | eye-redis |
|---|---|---|
| container | `edd27a0fc2b2`, started 2026-09-24T16:46:40Z | `1f63f74cd11b`, started 2026-09-24T16:46:40Z |
| image ref | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` | `redis@sha256:ba6e394f6acc2a695ef1b6944f161b9ca813711739be68319fa0db3470673f1d` |
| image id | `sha256:d7a8005067f5…` (PostgreSQL 18.6) | `sha256:675f7644831d…` |
| PID 1 (`/proc/1/status`) | `postgres`, Uid/Gid 70, CapPrm/CapEff/CapBnd 0, NoNewPrivs 1, Seccomp 2 | `redis-server`, Uid 999 Gid 1000, CapPrm/CapEff/CapBnd 0, NoNewPrivs 1, Seccomp 2 |
| health | healthy | healthy, `PONG` on the current password |
| volume | `new_project_eye-pgdata` (reused; PGDATA owned by uid 70) | — |

`eye_demo` on the recreated PostgreSQL: the same counts as §2 (81 migrations with the same digest, 30,999 objects, 104,291 audit
events, 73 principals, 14,573 outbox rows, 75,984 custody events) — a minor-version change of the server (18.4 → 18.6) on the same
data directory.

## 5. The application on the recreated services

`scripts/ops/demo-restart.sh` (no rebuild — the B21 artifact): `VERIFIED: the demonstration API serves eye_demo and is ready`
(`/readyz` `{"status":"ok","db":true,"audit":"ok","auditIncidents":0,"degradedSince":null}`; `EYE_SCHEDULER_ENABLED=true`; the
workspace vault roots). **21/21 human principals authenticate**; `twins/list` 201; `evidence/list` 201. The web shell started on
:3000 (the `eye-web` launch configuration) and serves the sign-in page; no browser sign-in was made.

## 6. Rollback, had it been needed

The derived images remain in the local image store (`be0012863211`, `6deece17eb4a`) and pinned in git history
(`docker-compose.yml` before `870b212`); the data volume was never removed; the backup of §1 was restored and verified on the
target images in §2. None was needed.

## 7. Limits

The backup is unsealed (the passphrase is the operator's, not on this host); the vault, journal and credential file were not copied
(untouched by a container recreation); the isolated check exercised the database, Redis, authentication and two governed reads,
not the scheduler's collection (the live scheduler resumed with the API). The official images' provenance and compatibility are
the C15 return's evidence (`infra/images/official/20260922/`), not re-derived here.
