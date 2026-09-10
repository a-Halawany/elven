# Backup and restore of the runtime state — runbook

Delivery package R0/P7-D, "Vault, database and credential recovery". This runbook
answers the `.eye-local` loss of 2026-09-09, when a branch checkout replaced the
real credential and vault directory and the demonstration had to be rebuilt from
nothing. It defines what the runtime state IS, how it is captured as one coherent
bundle, how the bundle is restored into an isolated environment and proved
coherent, and what the drill measured.

Scripts: `scripts/ops/backup.sh`, `scripts/ops/restore.sh`, the guard library
they share (`scripts/ops/lib/guards.sh`), the compose reader
(`scripts/ops/compose-services.mjs`) and the guard probe suite
(`scripts/ops/test-guards.sh`).
Drill evidence: `docs/ops/evidence/restore-drill-20260910T075051Z.md` (first
drill, 36/36), `docs/ops/evidence/restore-drill-20260910T161412Z.md` (second
drill with the corrected guards and image lookup, 37/37) and
`docs/ops/evidence/restore-drill-20260910T173954Z.md` (third drill: the
isolated containers started from the PUBLISHED GHCR digests with the compose
process protections applied and observed, 44/44); guard probes:
`docs/ops/evidence/guard-probes-20260910T161410Z.txt` (35/35) and
`docs/ops/evidence/guard-probes-20260910T173831Z.txt` (38/38). What changed
between the drills is in §14 and §15.

## 1. The runtime state, and why every part matters

The local profile (`docker-compose.yml`, the only profile — EXC-P0-004) keeps its
state in five places. A restore is coherent only when all five agree; each one
alone is either useless or dangerous.

| Part | Where | Why it must be restored together with the others |
| --- | --- | --- |
| PostgreSQL `eye` (harness/dev) and `eye_demo` (the demonstration, whose historical records must keep their digests) | container `eye-postgres`, volume `eye-pgdata`, image pinned by digest | Canonical objects, the append-only audit ledger with its hash chain, the blob manifests (locator + sha256 + byte length of every evidence blob), scheduler entries, identities and sessions. The ledger's heads (`audit.audit_chain_heads`) are allocator state that ADR-P0-09 says must never be trusted from a backup alone — they are verified against the ledger on restore. |
| Cluster globals (roles) | `pg_dumpall --globals-only` | The privilege separation (`eye`, `eye_app`, `eye_audit_allocator`, `eye_commit`, `eye_identity`, `eye_publisher`, `eye_verifier`, `eye_system`, `eye_recovery`) is enforced by ownership and grants inside the dumps; a database restored without these roles fails on every `OWNER TO` and every SECURITY DEFINER function, and the application pools cannot log in. The globals carry the SCRAM verifiers: they are secret material. |
| Evidence vault | `.eye-local/vault/quarantine` and `.eye-local/vault/evidence` (config `eye.vault.quarantine_root` / `eye.vault.evidence_root`, defaults resolved against the workspace root in `apps/api/src/config/config.ts`; layout `<vault>/<tenant>/<domain>/<uuid>` from `apps/api/src/observation/vault/vault.service.ts`) | The database holds the manifest (locator, sha256, length); the bytes live only here. Every read re-hashes the bytes against the manifest and fails closed on a mismatch, so a database without its vault is a set of evidence records that can never be served, and a vault without its database is a set of opaque files nobody can locate. |
| Degraded-audit journal | `apps/api/.eye-local/degraded-demo` (`EYE_DEGRADED_DIR`, set by `scripts/demo.sh` for the demonstration) and the dev default `apps/api/.eye-local/degraded` (`apps/api/src/shared/degraded-store.ts`) | A degraded audit state must survive a restart (`degraded-reconciliation.service.ts`): the journal is what keeps `/readyz` reporting `degraded` until governed recovery. Restoring a database with open incidents but no journal would come back reporting `ok`. |
| Configuration and credentials | `.eye-local/env` (0600): the role passwords, the Redis password, the JWT secret, the test/bootstrap passwords | The role passwords must match the SCRAM verifiers in the globals; the JWT secret must match for any issued session to remain valid; the demo personas' password is what the walkthrough logs in with. This is exactly the file lost on 2026-09-09. |

The bundle also records the pinned image digests of both containers, so a
restore runs the same PostgreSQL major and build the dump was taken from.

## 2. What is NOT backed up, and why

- **Redis (`eye-redis`)** — no durable state that cannot be rebuilt; see §3.
- **In-flight BullMQ jobs** — a collection or briefing tick that was executing at
  backup time is not captured. Its result is either already in the database (a
  committed run) or it never happened; the next scheduled tick runs again. No
  evidence is lost because the vault write, the manifest and the audit event are
  one transaction boundary in the acquisition path.
- **OS-level secrets** — nothing outside the repository's `.eye-local/env` is
  captured (no keychain, no shell profile, no Docker credentials).
- **Docker images** — pinned by immutable digest in `docker-compose.yml` and
  `conformance.manifest.json`; the bundle records both services' pins and their
  declared process protections (§13) and the restore starts from the bundle's
  recorded pin only if it resolves locally to that digest; it never pulls (the
  operator pulls a missing pin by digest first, §13).
- **Build output and dependencies** (`apps/api/dist`, `node_modules`) — rebuilt
  from git with `pnpm install --frozen-lockfile && pnpm build`.
- **Other databases in the cluster** (`eye_upgrade_0022`, `eye_virgin_0022`) —
  harness artefacts of the 0022 upgrade check; not runtime state.
- **The bundle is not encrypted.** It contains `config/env` and the SCRAM
  verifiers in `pg/globals.sql`. `backup.sh` creates it 0700/0600 under
  `$HOME/eye-backups`; encrypting it before it leaves the host is the operator's
  responsibility and outside this package.

## 3. Redis holds nothing that cannot be rebuilt — the evidence

- `apps/api/src/observation/scheduling/collection-worker.service.ts`,
  `onApplicationBootstrap()`: when the scheduler is enabled, the worker registers
  its handler and calls `reconcile('startup reconciliation')`, which reads
  `observation.schedules_to_reconcile()` under the schedule capability and
  `upsertJobScheduler`s every eligible persisted schedule back into Redis
  ("Idempotent: upsertJobScheduler keeps an existing scheduler's cadence in step
  and creates a missing one"). With the scheduler disabled it logs
  `scheduler disabled: no collection worker started, persisted schedules not reconciled`
  — the restored API in the drill printed exactly that line.
- `apps/api/src/executive/agents/agent-worker.service.ts`,
  `onApplicationBootstrap()` → `reconcile()`: room briefing cadences are read from
  `executive.briefings_to_reconcile()` and re-scheduled the same way.
- `apps/api/src/observation/scheduling/scheduler.service.ts` (header): the Redis
  identities are DERIVED from the stored, logical names and "never persisted"; a
  job payload "carries no authority" and the worker re-resolves everything at
  execution time.
- `apps/api/src/objects/outbox.publisher.ts`: the `domain-events` queue is fed
  from the database outbox by `publishPending()` on a timer; the outbox rows are
  the durable record.

The drill demonstrates the claim: `eye-restore-redis` started EMPTY
(`dbsize` = 0), the restored API reached `/readyz` `ok` and served a governed
read against it. Redis is therefore treated as a cache of intent that the
database re-creates.

## 4. Backup procedure

```
scripts/ops/backup.sh
```

Read-only against the live deployment (only `docker exec`/`docker inspect` on
the container named by the compose `postgres` service, file reads elsewhere).
The destination guards of §12 run first — before the credential file is read
and before any chmod, copy or write: `EYE_BACKUP_ROOT` (default
`$HOME/eye-backups`; create it once with `mkdir -m 700`) must already exist, be
a directory, not be a symlink, and be physically outside every protected path;
the bundle directory `<root>/<UTC timestamp>/` is then created fresh with a
plain `mkdir` (0700) and contains:

| File | Content |
| --- | --- |
| `pg/eye.dump`, `pg/eye_demo.dump` | `pg_dump -Fc` run inside the container as the migrate/superuser role, streamed to the host (nothing is written into the container or its volume) |
| `pg/globals.sql` | `pg_dumpall --globals-only` (roles and verifiers), 0600 |
| `vault.tar` | `.eye-local/vault` with paths relative to the repository root |
| `journal.tar` | the degraded journal directories that exist (absence is recorded in the manifest) |
| `config/env` | byte copy of `.eye-local/env`, 0600, compared with `cmp` |
| `MANIFEST.json` | sha256 and size of every file; git HEAD and branch; per database, before AND after the dumps: `schema_migrations` count and last filename, `objects.canonical_objects` count, audit event/seal/incident counts, every partition's chain head (`partition_id`, `next_seq`, `head_hash`, `frozen`), blob manifest and tombstone counts; `compose`: the sha256 of `docker-compose.yml`, whether it was unmodified in the worktree, and the `image:` of the `postgres` and `redis` SERVICES (§13); `images`: for each service, its container, image id and repo digests, `compose_pin`, `pin_matches` (the running image's repo digests carry the pin reference) and `pin_digest_matches` (they carry its digest) |
| `RUN.json` | the run manifest: every directory this run created. On failure, only what is recorded is removed (a partial bundle would otherwise leave a copy of the credentials behind); on success it is kept for the record |

Ordering is deliberate: dumps first, vault second. Blob bytes are never
rewritten, so every manifest in the dump has its bytes in the tar unless it was
tombstoned in the window between the two — the restore reports such a case
rather than hiding it. Because the demonstration collects hourly, the manifest
records the facts before and after the dumps and flags drift; the restore
accepts either value.

The script prints file names, sizes, counts and digests only. It loads
`.eye-local/env` with `set -a; . env; set +a` and passes the password to
`docker exec` as environment; it never echoes a value and must never be run
with `set -x`.

**Since the fourth drill (CP-4/5), the same procedure additionally**: builds the
API from the committed tree at HEAD with the committed lockfile and records the
BUILD IDENTITY, carrying the produced artifact as `api-dist.tar` (§16); records a
CAPTURE BOUNDARY on both sides of the window, and the quiescence note when there
is one (§19); and SEALS every payload file with AES-256-GCM under
`EYE_BACKUP_PASSPHRASE`, so what is on disk is `pg/eye.dump.enc`,
`pg/eye_demo.dump.enc`, `pg/globals.sql.enc`, `vault.tar.enc`, `journal.tar.enc`,
`config/env.enc` and `api-dist.tar.enc`, with `MANIFEST.json` and `RUN.json` in
the clear (§17). `backup.sh` refuses to run without the passphrase — after the
destination guards, before the credential file is read. An isolated source may be
named with `EYE_BACKUP_SOURCE_ROOT` + `EYE_BACKUP_SOURCE_PG_CONTAINER` +
`EYE_BACKUP_SOURCE_LABEL`; the override is refused when it names a container
`docker-compose.yml` declares or a root inside a protected path, so it can only
ever point AWAY from the live deployment.

## 5. Restore procedure (isolated)

```
scripts/ops/restore.sh <bundle> --into-isolated [--keep]
```

1. Validates every file of the bundle against `MANIFEST.json` (the bundle path
   is resolved to its physical path first).
2. Destination guards (§12), before any chmod, copy, extraction or container
   start: the restore root is `EYE_RESTORE_ROOT` or `$HOME/eye-restore/<ts>`;
   its parent must already exist, be a directory and not be a symlink (create
   `$HOME/eye-restore` once with `mkdir -m 700`); the root's physical path must
   be outside every protected path AND outside the bundle; the root is created
   fresh with a plain `mkdir` (it must not exist) and `RUN.json` is opened in it.
   The teardown trap is armed at that moment and is bound to `RUN.json`.
3. Preflight: refuses if `eye-restore-pg`, `eye-restore-redis` or volume
   `eye-restore-pgdata` exist or if ports 55433/56379/3402 are bound; requires
   `apps/api/dist/main.js`.
4. Image identity (§13): reads both pins from the bundle
   (`images.postgres.compose_pin`, `images.redis.compose_pin`), REPORTS when the
   source container was not running the pin at backup time (a container not yet
   recreated after a re-pin — the restore still starts from the pin, which is
   the deployment's declared image), requires each pin to resolve locally
   through `docker image inspect` to an image whose repo digests carry the pin's
   digest, checks the pins against the compose file of the source revision
   recorded in the bundle (`git show <git_head>:docker-compose.yml`, a PASS/FAIL
   check), and REPORTS whether the current `docker-compose.yml` differs (not a
   failure: the isolated restore uses the bundle's pins). It then resolves the
   process protections of each service (`user`, `cap_drop`, `security_opt`) from
   the bundle (`compose.services.<service>`; an older bundle falls back to the
   current compose file) and prints the `docker run` flags they become.
5. Copies `config/env` to `<restore root>/config/env` (0600) and loads it.
6. Creates the volume `eye-restore-pgdata` and starts `eye-restore-pg` from the
   bundle's postgres pin on `127.0.0.1:55433` with the declared protections
   (`--user 70:70 --cap-drop ALL --security-opt no-new-privileges:true`),
   recording the volume name and the container id in `RUN.json`; checks that
   the restored server's major version equals the dump's source server; reads
   `/proc/1/status` (and the first backend child's) inside the container and
   checks Uid/Gid, CapBnd/CapEff and NoNewPrivs against the declaration;
   restores `globals.sql` (exactly one expected error: the superuser role
   already exists in a fresh cluster); creates and `pg_restore`s both databases
   with ownership preserved.
7. Extracts `vault.tar` and `journal.tar` under the restore root.
8. Verifies coherence (§6).
9. Starts `eye-restore-redis` (empty, from the bundle's redis pin, with
   `--user 999:1000 --cap-drop ALL --security-opt no-new-privileges:true`;
   container id recorded; `/proc/1/status` observed and checked the same way)
   and a second API from `apps/api/dist/main.js`
   on `:3402` with `EYE_DB_HOST/PORT` → the restored cluster, `EYE_DB_NAME=eye_demo`,
   the vault and journal roots under the restore root, `EYE_SCHEDULER_ENABLED=false`;
   waits for `/readyz`, then runs a probe that logs in as the platform
   administrator, locates the demonstration scope, logs in as the demo member
   `m.dvorak`, lists evidence and downloads one evidence object, re-hashing the
   returned bytes against the manifest digest.
10. Stops the API (recorded pid) and removes EXACTLY the containers (by id) and
    the volume recorded in `RUN.json` — never a name pattern. The restore root,
    `RUN.json`, `RESTORE_REPORT.json`, the API log and the work files stay;
    `--keep` leaves the recorded resources running for inspection.

Overrides: `EYE_RESTORE_PG_PORT`, `EYE_RESTORE_REDIS_PORT`, `EYE_RESTORE_API_PORT`,
`EYE_RESTORE_ROOT`, `EYE_RESTORE_STRICT_BLOB_DBS` (default `eye_demo`; see §10).

**Since the fourth drill (CP-4/5)** the same procedure additionally: verifies the
passphrase and every GCM tag before writing anything and opens the payload into
`<restore root>/plain/` (§17); VERIFIES the application artifact it is about to
start against the bundle's recorded digest and refuses a divergent one, recording
a differing target build as a source-to-target upgrade (§16); tests that the
bundle's `config/env` actually opens every LOGIN role over TCP (§18); RECONCILES
the capture boundary row by row (§19); replays a restored degraded journal and
checks `/readyz` reports the degradation it implies (§20 and the drill record
§3); and finishes with a SCHEDULER phase that restarts the same artifact with
`EYE_SCHEDULER_ENABLED=true` against the empty isolated Redis (§20). Further
overrides: `EYE_BACKUP_PASSPHRASE` (required for a sealed bundle),
`EYE_RESTORE_REALIGN_CREDENTIALS`, `EYE_RESTORE_SCHEDULER_PHASE`,
`EYE_RESTORE_TICK_SOURCE`, `EYE_RESTORE_REPLAY_ROOT`.

## 6. Verification performed on the restored environment

| Check | Method | Drill result (first drill; the second drill's values are in its record) |
| --- | --- | --- |
| Image identity (second drill onwards) | bundle pins resolve locally by digest; pins = the source revision's compose file; current compose compared and reported | pass (1 check) |
| Server version (third drill onwards) | the restored server's major version = the dump's source server major (`server_version` recorded in the manifest) | pass (1 check; 18.4 → 18.4) |
| Process protections (third drill onwards) | for each isolated container, `/proc/1/status` read inside the container: Uid/Gid = the declared `user`, CapBnd = CapEff = 0 for `cap_drop: [ALL]`, NoNewPrivs = 1 for `no-new-privileges:true` | pass (6 checks; postgres 70/70, redis 999/1000, both `CapBnd 0000000000000000`, `NoNewPrivs 1`) |
| Bundle integrity | sha256 of every file = manifest | 6/6 |
| Roles | all nine roles present after globals | pass |
| `pg_restore` | rc 0, zero errors, both databases | pass (8 s + 1 s) |
| Schema position | `schema_migrations` count and `max(filename)` = manifest | 50 / `0050_phase6_residual_corrections_2.sql`, both databases |
| Object counts | `objects.canonical_objects`, audit events/seals/incidents/partitions, live manifests, tombstones = manifest | all equal (18 comparisons) |
| Audit chain | read-only re-computation of every partition with the same rules and the same contract functions as `AuditService.verifyChain` (`packages/contracts` `auditRowHash`, `jcsCanonicalize`, `GENESIS_HASH`): contiguous sequence, `previous_hash` links, canonical JCS bytes, recomputed `row_hash`, head reached, no orphan rows — without opening incidents | `eye`: 301/301 unfrozen partitions verify, 56,302 events re-hashed; 24 frozen partitions (the harness's tamper fixtures, each with a recorded integrity incident) restored frozen with identical heads. `eye_demo`: 2/2, 4,474 events |
| Chain heads | every head (`next_seq`, `head_hash`, `frozen`) = manifest | 325/325 and 2/2 |
| Heads consistent with the ledger | the value `audit.rebuild_chain_heads()` would write, computed read-only, equals the stored head for every unfrozen partition | 0 differences in both databases |
| Vault bytes | for EVERY non-tombstoned row of `observation.blob_manifests`: file present at `<vault>/<locator>`, sha256 = `content_digest`, length = `byte_length` | `eye_demo`: 247/247 (244 evidence, 3 quarantine). `eye`: 2,163 present and verified, 2,130 absent, 0 corrupt (§10) |
| Tars | sha256 of `vault.tar`/`journal.tar` = manifest, re-checked after extraction | pass |
| Second API | `/readyz` `{"status":"ok","db":true,"audit":"ok"}` | pass |
| Governed read | login → evidence list (201, 20 items) → evidence download (201, `integrity: verified`, returned bytes hash to the manifest digest) | pass |

36 checks, 36 passed in the first drill; 37 checks, 37 passed in the second
(the added check is the source-revision pin comparison); 44 checks, 44 passed
in the third (the added checks are the server major and the six process
protection observations).

## 7. Restore procedure (in place) — governed recovery

Not exercised by the drill; it is what the isolated drill de-risks. Run it only
under the governed recovery procedure (the break-glass role is deliberately
absent from the application configuration).

1. Stop the API and the web shell. Do not stop `eye-postgres` yet.
2. `scripts/ops/restore.sh <bundle>` (no flag) to validate the bundle.
3. Take a fresh backup of whatever is left (`backup.sh` tolerates a partially
   missing state only for the journal; if `.eye-local/env` is gone, skip this
   step — that is the 2026-09-09 case).
4. Place `config/env` at `.eye-local/env`, mode 0600, directory 0700. Restoring
   the credentials FIRST is what lets every later step authenticate.
5. Bring up a fresh cluster (`docker compose down`, remove `eye-pgdata`, `docker
   compose up -d --wait`), restore `pg/globals.sql`, create `eye` and `eye_demo`,
   `pg_restore` both.
6. Extract `vault.tar` and `journal.tar` at the repository root.
7. Run the §6 verification against the live cluster (the same scripts, pointed at
   port 5432) BEFORE starting the API. Only if every unfrozen partition verifies
   may `select audit.rebuild_chain_heads()` be considered, and only as the migrate
   role; the drill showed it would change nothing when the dump is consistent.
8. Start the API. With `EYE_SCHEDULER_ENABLED=true` the persisted schedules and
   briefing cadences are reconciled into Redis at bootstrap (§3); no Redis
   restore step exists.

## 8. Isolation guarantees of the drill

- `restore.sh` never names `eye-postgres`, `eye-redis`, `eye-pgdata`,
  `.eye-local/` or `apps/api/.eye-local/` in any command; the only live-side
  action in the whole procedure is `backup.sh`'s `docker exec … pg_dump`.
- Every created resource is prefixed `eye-restore-` AND recorded in the run
  manifest at creation; teardown removes only what is recorded, by container id
  and volume name, never by name pattern. The restore root is required to be
  physically outside every protected path (§12); the ports differ from the live
  ones (55433 vs 5432, 56379 vs 6379, 3402 vs 3401).
- The second API gets its own Redis, so no live queue sees a job or a scheduler
  from the restored instance; its vault and journal roots are under the restore
  root; its scheduler is disabled.
- Verification runs BEFORE the second API starts, so the counts compared are
  the restored data, not the data plus the probe's own login audit events.
- After the first drill: both live containers still reported `Up 25 hours (healthy)`;
  no `eye-restore-*` container or volume remained; the ports were released; no
  value of `.eye-local/env` appears in either transcript (checked by loading the
  file in a subshell and `grep -F`-ing each value against the transcripts —
  0 hits). After the second drill: `Up 33 hours (healthy)`, the same checks, and
  the same 0 hits across every transcript including the guard probes.

## 9. RPO / RTO as measured

| Quantity | First drill (07:50Z) | Second drill (16:14Z, corrected scripts) | Third drill (17:39Z, GHCR pins + protections) |
| --- | --- | --- | --- |
| Backup duration | 5 s (dumps 2 s + 0 s, globals, tar of 2,757 files, manifest) | 5 s (dumps 3 s + 0 s, tar of 2,775 files) | 8 s (dumps 3 s + 0 s, tar of 7,717 files) |
| Bundle size | 82,840 KB (`pg/eye.dump` 36,561,204 B; `pg/eye_demo.dump` 3,415,342 B; `vault.tar` 43,844,608 B; `journal.tar` 3,584 B; `globals.sql` 2,879 B; `config/env` 790 B) | 82,264 KB (`pg/eye_demo.dump` 3,541,647 B; `vault.tar` 43,933,696 B; the rest equal in size) | 112,180 KB (`pg/eye_demo.dump` 12,825,495 B; `vault.tar` 64,598,016 B; the rest equal in size) |
| Restore duration (container start, globals, two `pg_restore`s, tar extraction) | 12 s | 12 s | 16 s (`pg_restore` 9 s + 3 s) |
| Verification | 2 s (plus 3 s in the first run) | 3 s | 4 s (21,104 demo events re-hashed, 5,205 blobs) |
| Second API up and governed read proven | 16 s total from the start of the restore | 17 s | 22 s |
| RTO (technical, local profile) | under one minute end to end; the operator steps of §7 dominate |||
| RPO | the interval between backups. The demonstration collects hourly (SCHEDULED_COLLECTION.md), so a backup after every scheduled tick, and after every seed, migration or credential rotation, bounds the loss to one collection window. Nothing in the bundle is incremental; each run is a full, self-contained bundle. |

## 10. Limitations found in the drill

1. **Harness database blobs.** `eye` has 4,293 live manifests but only 2,163 of
   them have bytes in `.eye-local/vault`; 2,130 are absent (0 corrupt). The
   integration and acceptance suites point the API at per-test temporary vault
   roots (`mkdtempSync(join(tmpdir(), 'eye-accept-vault-'))` in
   `apps/api/test/int/phase1-acceptance.test.ts` and the fault-injection suite)
   that are gone when the test ends, while the manifests stay in `eye`. The
   harness database is therefore not a coherent evidence store and never was;
   the strict all-rows requirement is applied to `eye_demo`
   (`EYE_RESTORE_STRICT_BLOB_DBS`), and `eye` is required to have zero corrupt
   bytes, with the absent count reported.
2. **Frozen partitions.** `eye` carries 24 partitions frozen by tamper-detection
   tests (17 `chain_broken`, 6 `noncanonical_bytes`, 1 `orphan_rows`) with 36
   recorded integrity incidents. They restore frozen, with the same heads and
   the same incident count; they are not, and must not be, "repaired" by a
   restore. `eye_demo` has none.
3. **Snapshot boundary.** `pg_dump` is a consistent snapshot per database, but
   the two dumps and the vault tar are three moments. The manifest's before/after
   facts detect drift (none in the drill) and the dump-then-vault order bounds
   the only incoherence that could arise to a tombstone in the window.
4. **Expected globals error.** `role "eye" already exists` — the superuser is
   created by the image before the globals run; its `ALTER ROLE` still applies.
5. **Journal content.** The demo journal directory existed but was empty and the
   dev default did not exist; the drill therefore proves the journal path is
   carried, not a non-trivial replay of a degraded state.
6. **Quarantine.** `eye_demo` has 4 quarantine manifests of which 1 is tombstoned;
   the 3 live ones verified. The tombstoned blob's absence is correct, not a loss.
7. **The restored API writes.** The probe's logins append audit events and
   sessions to the restored `eye_demo`, and the outbox publisher runs against
   the restored Redis. The isolated environment is disposable; the comparison
   counts were taken before the API started.
8. **Secrets in the bundle** — see §2. The drill's transcripts were checked for
   every value of `.eye-local/env`; the bundle itself is where the values live.

## 11. Drill record — 2026-09-10

- Repository: `phase6-decisions` @ `2e839458361b2accc457f5ae1b53d7a2263780ce`.
- Bundle: `$HOME/eye-backups/20260910T075051Z` (backup start 07:50:51Z, 5 s).
- Restore root: `$HOME/eye-restore/20260910T075301Z` (restore 07:53:01Z–07:53:18Z).
- Images: `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`
  (PostgreSQL 18.4), `redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241`;
  both `pin_matches=true`.
- `eye`: 50 migrations (last `0050_phase6_residual_corrections_2.sql`),
  14,227 canonical objects, 56,303 audit events, 44 seals, 36 incidents,
  325 partitions (301 unfrozen verified, 24 frozen), 4,329 manifests (4,293 live,
  36 tombstones).
- `eye_demo`: 50 migrations (same last file), 634 canonical objects, 4,474 audit
  events, 0 incidents, 2 partitions (`platform` next_seq 257, the demo tenant
  next_seq 4219), 248 manifests (244 evidence + 4 quarantine; 247 live, 1
  tombstone), 247/247 blobs present and verified.
- File digests (sha256): `pg/eye.dump` `657680b9…2dca1219`; `pg/eye_demo.dump`
  `a5e4b7f6…67e767ed`; `pg/globals.sql` `ee5ddf4a…5a44800c`; `vault.tar`
  `0f164758…948dafe0`; `journal.tar` `efa74ef0…fc584022d`; `config/env`
  `f4e42b00…f30ee6c2`; `MANIFEST.json` `6b720a54…5c8d09edd`. The full digests
  are in the evidence transcript.
- Result: 36 checks passed, 0 failed; `RESTORE VERIFIED`; teardown complete;
  live deployment untouched.

## 12. Destination guards (second drill onwards)

The independent review of the first drill executed the two guard fragments
against disposable stand-in directories and found both wanting: `restore.sh`
resolved its root with `cd … && pwd` (a logical path) and compared a textual
prefix, so an OUTSIDE symlink pointing into the repository was accepted while
the physical destination was inside it; `backup.sh` checked the PARENT of
`EYE_BACKUP_ROOT`, so a root equal to the repository itself was accepted. Both
scripts now share `scripts/ops/lib/guards.sh`, whose rules are:

- **Physical paths.** Every destination is resolved with `cd -P && pwd -P`
  (present on macOS bash 3.2 and Linux; no GNU `realpath` dependency). A path
  that does not exist yet is resolved through its nearest existing ancestor; a
  dangling symlink component is followed so that its physical intent is judged.
- **Protected set.** The repository worktree, its git common directory (a
  worktree's `.git` lives elsewhere), `.eye-local` and `apps/api/.eye-local`
  (and the target of either if it is a symlink — the 2026-09-09 incident shape),
  every bind-mount host path declared in `docker-compose.yml` (read by service
  structure; the local profile declares none — `eye-pgdata` is a named volume
  inside the Docker VM), and, for a restore, the bundle being restored.
- **Containment.** A destination is refused if its physical path is inside,
  equal to, or an ancestor of any protected path.
- **No symlinks.** The destination and every ancestor between it and its
  nearest pre-existing directory (inclusive) must not be a symlink.
- **Fresh destinations.** `restore.sh` creates its root with a plain `mkdir`
  (fails if the path exists in any form: directory, file or dangling symlink);
  its parent must already exist, be a directory and not be a symlink.
  `backup.sh` requires `EYE_BACKUP_ROOT` to already exist, be a directory, not
  be a symlink and pass containment, then creates the timestamped bundle
  directory with a plain `mkdir`.
- **Order.** The guards run before the credential file is read (backup) and
  before any chmod, copy, tar extraction or container start (both).
- **Cleanup bound to the run.** Every directory, container (by id), volume and
  process a run creates is appended to `RUN.json` as it is created; cleanup
  (teardown in restore, failure cleanup in backup) removes only recorded
  resources, never anything matched by a name pattern.

`scripts/ops/test-guards.sh` proves these rules with the same functions against
stand-ins under `mktemp` (the real repository, `.eye-local`, containers and
volumes are never a destination): outside symlink into a stand-in repository →
refused (the transcript shows the physical destination inside the repository);
backup root equal to the stand-in repository → refused; a destination that
already exists → refused; a nested symlinked ancestor → refused; a legitimate
fresh destination → accepted and created; plus the ancestor, `.eye-local`,
bind-mount, dangling-symlink and symlinked-`.eye-local` variants, and end-to-end
invocations of the real scripts with stand-in destinations that are refused
before anything is created (`docker ps -aq` unchanged). Transcript:
`docs/ops/evidence/guard-probes-20260910T161410Z.txt` (35/35).

Operator consequence: `$HOME/eye-backups` and `$HOME/eye-restore` are created
once by the operator (`mkdir -m 700`); the scripts no longer `mkdir -p` a root,
and never `chmod` a directory they did not create.

## 13. Image identity (second drill onwards)

The first drill's scripts found the pins with a textual `image: postgres@…` /
`image: redis@…` match, which cannot match the GHCR references the maintenance
images will be pinned to (`ghcr.io/a-halawany/elven/postgres@sha256:…`). Both
scripts now read `docker-compose.yml` by COMPOSE SERVICE IDENTITY through
`scripts/ops/compose-services.mjs` (a YAML parse with the repository's `yaml`
package; `services.postgres.image`, `services.redis.image`, `container_name`,
and the bind-mount host paths of §12), whatever registry or path the reference
carries.

- `backup.sh` records both pins in `MANIFEST.json` (`compose.services.*.image`
  and `images.*.compose_pin`), the sha256 of the compose file and whether it was
  unmodified in the worktree, and for each running container whether its repo
  digests carry the pin reference (`pin_matches`) and its digest
  (`pin_digest_matches`).
- `restore.sh` starts `eye-restore-pg` and `eye-restore-redis` from the BUNDLE'S
  recorded pins. Before `docker run`, each pin must resolve locally
  (`docker image inspect <pin>`) to an image whose repo digests carry the pin's
  digest; no pull is attempted. It then checks (PASS/FAIL) that the bundle's
  pins equal those of the compose file at the source revision recorded in the
  bundle (`git show <git_head>:docker-compose.yml`, parsed the same way) and
  REPORTS, without failing, whether the current `docker-compose.yml` pins
  different images — a restore of an older bundle after a re-pin is legitimate
  and runs on the images the bundle was taken from.

The GHCR shape is proved by the probe suite against a stand-in compose file
(the old textual predicate is reproduced as non-matching; the service parse
returns the GHCR reference, from a file and from stdin). The second drill ran
before the re-pin and started its containers from `postgres@sha256:9a8afca5…`
and `redis@sha256:978f0e01…`.

### 13.1 The published pins, and the third drill (2026-09-10, 17:39Z)

Since commit `c9d3d68` the compose services are pinned to the published derived
images (`docs/images/DERIVED_IMAGES_APPROVAL.md`):

| Service | Compose pin (index digest) | Local image at the drill | Image `USER` |
| --- | --- | --- | --- |
| `postgres` | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` | `sha256:be0012863211c75f40ef47d1476f29ecca50f73e5803e7c3da181aaddfef32ff` (linux/arm64; `RepoDigests` carry the pin and the platform manifest `sha256:d3dd485b…`) | `postgres` |
| `redis` | `ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15` | `sha256:6deece17eb4ace79ccc6b65ff9ece991dee07b3136d2df4cd405c63be7046937` (linux/arm64; `RepoDigests` carry the pin) | `redis` |

The third drill (`docs/ops/evidence/restore-drill-20260910T173954Z.md`) is the
reviewer's T2 case: the bundle is taken while the LIVE containers still run the
previous official images (they are recreated in a separate, recorded
operation), and the restore must run on the published digests with the
deployment's process protections. What the scripts do since that drill:

- **Operator pull by digest.** `restore.sh` never pulls. When a pin is not
  present locally, the operator pulls it by digest first
  (`docker pull ghcr.io/a-halawany/elven/postgres@sha256:69a97…`; the images are
  public, an anonymous pull works) and confirms with `docker image inspect` that
  the local image's `RepoDigests` carry the pin. Both scripts now read
  `RepoDigests` from the inspect JSON through `jq`: on Docker 28.5.1 the
  `{{join .RepoDigests ","}}` template fails ("wrong type for value") when the
  image is addressed by one of these multi-platform references, while the JSON
  is intact.
- **Running image vs pin is a report, not a refusal.** `backup.sh` records, per
  service, the pin (`images.<service>.compose_pin`), the running container's
  `repo_digests`, `pin_matches` / `pin_digest_matches`, and now the declared
  process protections next to the pin (`compose.services.<service>.user`,
  `.cap_drop`, `.security_opt`; also `images.<service>.compose_protections`)
  together with what the running container actually carries
  (`images.<service>.running_protections` from `Config.User` /
  `HostConfig.CapDrop` / `HostConfig.SecurityOpt`, and
  `running_protections_match`). `restore.sh` used to refuse a bundle whose
  source container did not run the pin; it now REPORTS the divergence and starts
  from the pin — the pin is the deployment's declared image — and adds a check
  that the restored server's major version equals the dump's source server
  (`database_facts.*.server_version`; 18.4 → 18.4 in the drill).
- **Protections applied the way compose would.** `restore.sh` takes each
  service's `user` / `cap_drop` / `security_opt` from the bundle (falling back to
  the current compose file for a bundle that predates the record, and reporting
  which source it used), turns them into `--user <u> --cap-drop <c>…
  --security-opt <s>…` and passes them to the two `docker run`s. The isolated
  postgres therefore initialises its fresh volume and restores both dumps as
  uid 70 with no capabilities; the isolated redis runs as uid 999/1000.
- **Protections observed, not assumed.** After each container is ready the
  script reads `/proc/1/status` inside it (and the first process whose parent is
  PID 1 — a postgres backend), prints `Name`, `Uid`, `Gid`, `CapPrm`, `CapEff`,
  `CapBnd`, `NoNewPrivs`, `Seccomp`, and checks: Uid/Gid = the declared user;
  `CapBnd` = `CapEff` = `0000000000000000` when `cap_drop` contains `ALL`;
  `NoNewPrivs` = 1 when `security_opt` contains `no-new-privileges:true`.
  `RESTORE_REPORT.json` carries the whole identity under `image_identity`
  (pin, container id, local image id and `RepoDigests`, image `USER`,
  protections declared with their source, `HostConfig` and the `/proc` lines
  observed).

Observed in the third drill, both runs (containers `80861682cf46`/`5f6c1c388240`
and, the drill of record, `8c24ed668a25`/`81b09aa98047`):

| Container | HostConfig | PID 1 | First child |
| --- | --- | --- | --- |
| `eye-restore-pg` | `user 70:70, cap_drop [ALL], security_opt [no-new-privileges:true]` | `postgres; Uid 70 70 70 70; Gid 70 70 70 70; CapPrm 0; CapEff 0; CapBnd 0000000000000000; NoNewPrivs 1; Seccomp 2` | pid 51, `postgres`, identical fields |
| `eye-restore-redis` | `user 999:1000, cap_drop [ALL], security_opt [no-new-privileges:true]` | `redis-server; Uid 999 999 999 999; Gid 1000 1000 1000 1000; CapPrm 0; CapEff 0; CapBnd 0000000000000000; NoNewPrivs 1; Seccomp 2` | none |

These equal the values `infra/images/candidates/evidence/v3/process-protections.txt`
measured for the v3 candidates under the same flags. The live `eye-postgres` /
`eye-redis` still ran `postgres@sha256:9a8afca5…` / `redis@sha256:978f0e01…`
with no user, no `CapDrop` and no `SecurityOpt` at backup time — recorded in the
manifest as `pin_digest_matches: false`, `running_protections_match: false` —
and were not touched by the drill.

## 14. What changed since the first drill, and the second drill's record

| Area | First drill (scripts as reviewed) | Second drill (corrected) |
| --- | --- | --- |
| Restore root guard | `cd && pwd` (logical) + textual prefix; `mkdir -p` before the check | physical path; containment against the protected set and the bundle; no symlink in the chain; parent must exist; fresh plain `mkdir`; before any chmod/copy/extraction/container |
| Backup root guard | parent of `EYE_BACKUP_ROOT` checked textually; `mkdir -p` and `chmod 700` of the root | root must exist, be a directory, not a symlink, physical containment; bundle dir fresh; no chmod of the root; guards run before the credential file is read |
| Image lookup | `grep 'image: postgres@'` / `'redis@'` | compose service identity (`compose-services.mjs`); both pins recorded; restore starts from the bundle's pin after a local digest resolution; source-revision check; current-compose report |
| Cleanup | `docker rm -f eye-restore-pg eye-restore-redis`, `docker volume rm eye-restore-pgdata` by name | bound to `RUN.json`: recorded container ids, recorded volume, recorded pid; backup removes its partial bundle on failure |
| Portability | `stat -f`, `shasum` | `ops_mode` / `ops_sha256` fall back to `stat -c` / `sha256sum`; `cd -P`/`pwd -P` everywhere; bash 3.2 |
| Checks | 36 | 37 (source-revision pin comparison added) |

Drill record — 2026-09-10, second drill (`docs/ops/evidence/restore-drill-20260910T161412Z.md`):

- Repository: `phase6-decisions` @ `59a245938f88ad9d3abb1a0518c69645eb9c06c7`
  (scripts as corrected, uncommitted at drill time; `docker-compose.yml` carried
  another session's uncommitted process-protection keys — pins unchanged — which
  the manifest recorded as `unmodified_in_worktree: false` and the restore
  reported).
- Bundle: `$HOME/eye-backups/20260910T161412Z` (16:14:11Z–16:14:17Z, 5 s,
  82,264 KB). Restore root: `$HOME/eye-restore/20260910T161418Z`
  (16:14:17Z–16:14:36Z).
- Images: `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`
  (PostgreSQL 18.4) and `redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241`,
  both resolved locally by digest before start; pins equal the source revision's
  compose file; current compose pins the same.
- `eye`: unchanged since the first drill (50 migrations, 14,227 canonical
  objects, 56,303 audit events, 325 partitions, 4,293 live manifests).
  `eye_demo`: 667 canonical objects, 4,790 audit events, 2 partitions, 264
  manifests (263 live), 263/263 blobs present and verified; vault 2,775 files.
- Result: 37 checks passed, 0 failed; `RESTORE VERIFIED`; teardown removed the
  two recorded container ids and the recorded volume; live deployment
  untouched; 0 secret values in any transcript.

## 15. Third drill — the published GHCR digests with the process protections

| Area | Second drill | Third drill (`docs/ops/evidence/restore-drill-20260910T173954Z.md`) |
| --- | --- | --- |
| Pins | official `postgres@…` / `redis@…` | `ghcr.io/a-halawany/elven/postgres@sha256:69a974…` / `…/redis@sha256:1ad0ff…` (§13.1), pulled by digest by the operator, resolved locally before start |
| Source container vs pin | equal | the live containers still ran the previous images: recorded (`pin_digest_matches: false`) and REPORTED by the restore, which starts from the pin; server major checked (18 = 18) |
| Process protections | none passed to the isolated containers | `user` / `cap_drop` / `security_opt` recorded in the bundle beside the pin, passed to both `docker run`s, `/proc/1/status` observed and checked (6 checks) |
| `RepoDigests` | Go template | inspect JSON through `jq` (the template fails on these references under Docker 28.5.1) |
| `vault.payload_bytes` | last `wc -c` batch only (under-reported once the vault exceeded one argv: 6,382,938 in the first run of the day) | summed per file (40,345,338 B for 7,717 files) |
| Guard probes | 35 | 38 (`guard-probes-20260910T173831Z.txt`: the protections are read by service identity from flow and block lists; the real compose declares them for both services) |
| Checks | 37 | 44 |

Drill record — 2026-09-10, third drill:

- Repository: `phase6-decisions` @ `c9d3d684078a1359dd30f8b18359dd9c1b539533`
  (`docker-compose.yml` unmodified in the worktree, sha256 `4714c8b9…9d07905`;
  `scripts/ops/*` as modified for this drill, uncommitted at drill time;
  `apps/api/dist` newer than every source file, no rebuild).
- Bundle: `$HOME/eye-backups/20260910T173954Z` (17:39:53Z–17:40:02Z, 8 s,
  112,180 KB). Restore root: `$HOME/eye-restore/20260910T174017Z`
  (17:40:16Z–17:40:40Z). A first run of the same scripts before the
  `payload_bytes` fix (bundle `20260910T173834Z`, root `20260910T173907Z`) also
  passed 44/44 and is kept under `$HOME`; its transcripts are in the record.
- `eye`: unchanged since the first drill. `eye_demo`: 10,552 canonical objects,
  21,104 audit events, 2 partitions, 5,206 manifests (5,205 live: 5,202
  evidence + 3 quarantine), 5,205/5,205 blobs present and verified; vault 7,717
  files.
- Result: 44 checks passed, 0 failed; `RESTORE VERIFIED`; teardown removed the
  two recorded container ids and the recorded volume; live containers
  `Up 35 hours (healthy)` before and after, still on the previous images (their
  recreation is a separate recorded operation); 0 secret values in any
  transcript.


## 16. Application-artifact identity (fourth drill onwards)

Sections 1–15 stand unchanged. What this section adds is the answer to the
reviewer's CP-4/5 finding: *"the drill reuses `apps/api/dist` because no source
file is newer than the newest dist file. File timestamps do not prove which
source and dependencies produced that build, and `restore.sh` starts
`apps/api/dist/main.js` without verifying a recorded application-artifact
digest."*

Both halves are now closed. `scripts/ops/build-identity.mjs` is the single place
that knows what an artifact is.

### 16.1 What the backup builds, and what it records

`backup.sh` builds the API **before anything is dumped**:

```
git archive <HEAD>  |  tar -x -C <build root>/src      # the COMMITTED tree; the worktree is never built
pnpm install --frozen-lockfile                         # in that checkout
pnpm --filter @eye/api... build                        # @eye/api alone cannot compile: it needs packages/contracts
```

No test suite is run. `MANIFEST.json.build` then carries:

| field | meaning |
| --- | --- |
| `git.sha`, `git.head_at_build`, `git.branch` | the revision the artifact is of |
| `git.worktree_clean`, `git.worktree_changes[]` | whether the checkout had uncommitted work, and exactly which paths. The build is of the COMMITTED tree either way; a dirty worktree is a fact to see, not a reason to build something else |
| `lockfile.sha256`, `lockfile.frozen` | the committed `pnpm-lock.yaml` the dependencies came from |
| `toolchain.node`, `toolchain.pnpm`, `platform`, `arch` | what compiled it |
| `build.started_at_utc`, `build.ended_at_utc`, `build.duration_seconds`, `build.commands[]` | the build window and the three commands, each with its own duration |
| `dist.digest`, `dist.files`, `dist.bytes` | the artifact's identity |
| `build.root`, `build.source_root`, `build.dist_path`, `build.node_modules` | where that artifact and its dependency tree live |

**The digest** is `sha256` over sorted `"<sha256 of file>  <relative posix path>"`
lines, one per file. It depends only on contents and relative paths: not on
mtimes, not on inode order, not on which directory the tree is in. Two trees with
the same digest have the same bytes at the same paths. It is reproducible — two
independent `git archive` + frozen-install + build runs of one SHA produce the
same digest.

The bundle also **carries the artifact**: `api-dist.tar` (a few MB), sealed like
every other payload file, so a restore is never left looking for a build. And
`build_matches_running_dist` records whether the deployment's own
`apps/api/dist` is that same artifact, with the per-file difference in
`running-dist-comparison.json` when it is not.

**The build root** (a checkout plus its `node_modules`, ~1.2 GB) lives *beside*
the bundles, at `${EYE_BACKUP_BUILD_ROOT:-$EYE_BACKUP_ROOT/builds}/<timestamp>`,
guarded like every other destination and recorded in the run manifest.
`EYE_BACKUP_PRUNE_BUILD=1` removes the checkout after the artifact is tared,
keeping only `BUILD_IDENTITY.json` and `DIST_ENTRIES.json`; restore then runs the
bundle's own `api-dist.tar` against the repository's `node_modules` and reports
whether the repository's `pnpm-lock.yaml` is the one the artifact was built with.
`EYE_BACKUP_SKIP_BUILD=1` skips the build entirely and the manifest says so — a
bundle with no build identity is a bundle a restore cannot bind to an artifact,
and the restore says exactly that instead of pretending otherwise.

### 16.2 What the restore verifies, and what it refuses

Before it starts anything, `restore.sh`:

1. extracts `api-dist.tar` into `<restore root>/artifact/`, **re-digests it** and
   compares with `MANIFEST.json.build.dist.digest`. A mismatch is fatal:
   `REFUSED: the artifact in this bundle does not have the digest the bundle
   records. Nothing is started.`
2. chooses the tree it will actually run and says so in the receipt — the build
   root when it still exists (self-contained: the verified dist **and** the
   `node_modules` of the frozen-lockfile install), otherwise the bundle's own
   extracted artifact with the repository's `node_modules` and a reported
   lockfile comparison;
3. digests the **target host's** `apps/api/dist` and compares. Equal → recorded
   as "not an upgrade". Different → recorded as a **source-to-target upgrade**,
   with both git SHAs and both digests printed, and the restore still runs the
   BUNDLE's artifact:

   ```
   SOURCE-TO-TARGET UPGRADE, recorded explicitly:
     bundle artifact: git <sha>  dist sha256:…
     target artifact: git <sha>  dist sha256:…
     the restore runs the BUNDLE'S artifact, verified above. Running the target's build over this
     data would be an upgrade and must be decided by the operator, not accepted silently here.
   ```

   Deciding to run the target's build over restored data is an operator act: it
   is a schema/behaviour change against data captured by a different build, and
   it belongs with the governed in-place procedure of §7, not inside a drill.

`RESTORE_REPORT.json.application_artifact` records all of it:
`identified`, `bound_to_bundle`, `digest`, `git_sha`, `started_from`, `cwd`,
`main`, `target_host.{dist_digest,git_head}` and `source_to_target_upgrade`.

A bundle from before this section (`eye-backup-bundle/1`) is still restorable.
It records no build identity, and the restore says so plainly rather than
implying a binding it does not have:
`REPORT: the restore therefore starts <repo>/apps/api/dist (digest …) as an
UNIDENTIFIED artifact … The receipt below is not bound to a build.`

## 17. Encryption at rest, and recovering the key

Every bundle is encrypted. `backup.sh` refuses to run without
`EYE_BACKUP_PASSPHRASE`; `restore.sh` refuses a bundle whose passphrase tag does
not verify.

### 17.1 What the operator needs to restore

**Two things, and neither is derivable from the other:**

1. **the bundle directory** — `pg/*.dump.enc`, `pg/globals.sql.enc`,
   `vault.tar.enc`, `journal.tar.enc`, `config/env.enc`, `api-dist.tar.enc`,
   plus `MANIFEST.json` and `RUN.json` in the clear (neither holds a secret);
2. **the passphrase the bundle was sealed with**, supplied in the environment as
   `EYE_BACKUP_PASSPHRASE`.

```
EYE_BACKUP_PASSPHRASE="$(security find-generic-password -w -s eye-backup)" scripts/ops/backup.sh
EYE_BACKUP_PASSPHRASE="$(security find-generic-password -w -s eye-backup)" scripts/ops/restore.sh <bundle> --into-isolated
```

**Where the passphrase must be kept:** in the operator's password store (macOS
Keychain, a password manager, or an offline sealed record) — somewhere that is
**not** the machine holding the bundles, and **not** this repository. A bundle
and its passphrase in the same place is a bundle that is not encrypted in any
sense that matters. It is never typed on a command line (that would put it in
`ps`), never written into the bundle, and never logged.

**If the passphrase is lost, the bundle is lost.** There is no recovery path and
no escrow. The data key exists only wrapped under a key derived from that
passphrase; nothing in the bundle, in this repository or on the host can produce
it. Rotating the passphrase means taking a **new** backup under the new one — an
existing bundle cannot be re-wrapped without the old passphrase.

### 17.2 The scheme, and why it is not `openssl enc`

Checked on the drill host (2026-09-10), and re-checked in each drill's preflight:

```
openssl: OpenSSL 3.6.4                     openssl enc -aes-256-gcm: "enc: AEAD ciphers not supported"
age: not installed                         gpg: not installed
```

`openssl enc` has never supported AEAD ciphers, and neither `age` nor `gpg` is
installed here. The remaining documented fallback is `openssl enc -aes-256-cbc`
with a separate HMAC. **It is not used**, and the reason is a hard constraint of
this path rather than a preference: with a per-bundle *random* key, `openssl enc`
can only be given that key as `-K <hex>` **on the command line**, where every
process on the host can read it in `ps`. Node is already a hard requirement of
both scripts, its crypto is OpenSSL's own libcrypto, and it provides the AEAD
that the CLI will not — with the key material held only in process memory.

**The limitation, stated:** the encryption is AES-256-GCM through `node:crypto`,
not through the `openssl` command-line tool. A host without node cannot open
these bundles with `openssl` alone; `scripts/ops/bundle-crypto.mjs` (or an
equivalent 40-line AES-256-GCM reader driven from `MANIFEST.json.encryption`) is
required. The manifest records every parameter needed to write one.

| element | value |
| --- | --- |
| passphrase | `EYE_BACKUP_PASSPHRASE`, environment only; never a flag, never defaulted, never printed, never in the bundle |
| KEK | PBKDF2-HMAC-SHA512(passphrase, salt, 600,000 iterations, 32 bytes); 16-byte salt **per bundle** |
| verification tag | HMAC-SHA256(KEK, `"eye-backup-bundle/2:verify:" + saltHex`) — checked **before any ciphertext is read**, so a wrong passphrase is a clear refusal, not a confusing decrypt error |
| DEK | 32 random bytes **per bundle**, in memory only |
| wrapped DEK | AES-256-GCM(KEK, iv, aad `"eye-backup-bundle/2:dek"`); only the wrapped form is recorded |
| per file | AES-256-GCM(DEK, per-file iv, **aad = the file's path inside the bundle**) — a ciphertext cannot be moved to another path without the tag failing. iv, tag, ciphertext sha256, plaintext sha256 and plaintext size are recorded |

`bundle-crypto.mjs seal` removes each plaintext once its ciphertext is written,
and `backup.sh` then proves the seal opens before declaring the bundle complete.

### 17.3 Integrity before extraction

`restore.sh <bundle>` (without `--into-isolated`) verifies the passphrase tag,
then authenticates every sealed file by its GCM tag and decrypts it **to a null
sink** to check its plaintext sha256 — **no plaintext is written at all**.

With `--into-isolated`, the payload is opened into `<restore root>/plain/` (0700)
*after* the restore root exists — never next to the ciphertext, and never inside
the bundle, which is treated as read-only. Each file is decrypted to a temporary
path and renamed into place only once GCM has authenticated the whole stream, so
a tampered file never appears as a readable file. Each decrypted file is then
re-hashed against `MANIFEST.json` as its own check.

`scripts/ops/test-guards.sh` pins the behaviour on stand-in bundles: sealing
leaves no plaintext; the manifest carries only KDF parameters, a verification tag
and the wrapped key; a wrong passphrase is refused before any ciphertext is read;
an absent passphrase is refused and never defaulted; the right passphrase opens
byte-for-byte; one flipped ciphertext byte gives `authentication FAILED` **and no
plaintext is written**.

## 18. Credential recovery is verified, not assumed

The bundle copies `.eye-local/env` faithfully. Until the fourth drill nothing
checked that the copy **opens** the roles the same bundle restores — and it could
not be checked by hand either, because the postgres image's `pg_hba.conf`
**trusts** connections made from inside the container:

```
local   all   all                         trust
host    all   all   127.0.0.1/32          trust
host    all   all   all                   scram-sha-256
```

so `docker exec psql -U eye_app` succeeds whatever the password is. `restore.sh`
now connects **over TCP**, where `scram-sha-256` actually applies, once per role:

```
==> credential recovery: does the bundle's config/env actually OPEN the roles the bundle restores?
  roles restored from pg/globals.sql that can log in: eye eye_app eye_commit eye_identity eye_publisher eye_recovery eye_verifier
  roles restored NOLOGIN by design (SET ROLE targets, never authenticated directly): eye_audit_allocator eye_system
  PASS  every LOGIN role restored from pg/globals.sql is opened by the credentials in the bundle's config/env
```

Only roles that can log in are tested; a `NOLOGIN` role is reported as such, not
as a failure. A role with no matching credential in the bundle is reported as
`no credential for this role in the bundle`.

When roles are refused, the check **stays failed** — it is a property of the
source deployment — and the finding is printed in full. For a drill that must
continue past it, `EYE_RESTORE_REALIGN_CREDENTIALS=1` re-applies the bundle's own
credentials to the **isolated cluster's** roles, names every role it realigned in
the log and in `RESTORE_REPORT.json.credential_recovery.realignment`, and does
**not** clear the failed check. It changes nothing outside the isolated cluster.

The governed read (login → evidence list → evidence download with the digest
re-verified) additionally exercises the **operator** credential, and reports the
deployment's own error code when it is refused, so
"the bundle's administrator password is not the stored credential" is
distinguishable from "the restore is broken".

## 19. The capture boundary, and what restore reconciles

The dumps, the vault tar and the journal tar are separate moments. Two mechanisms
now cover that, and a bundle records which one it got.

**Recorded boundary (always).** `backup.sh` records a boundary on **both** sides
of the capture window:

- per database: `pg_snapshot_xmin`/`pg_snapshot_xmax` of `pg_current_snapshot()`
  (a pure read — `pg_current_xact_id()` would assign a transaction id and
  therefore *write*), the audit head per partition, the newest blob manifest, and
  the audit/manifest/scheduler counts;
- for the vault: a listing digest over sorted `"<size> <path>"` lines.

Stability is judged on what was **admitted**, never on the snapshot markers,
which advance with every transaction anywhere in the cluster.

**Quiescence (isolated sources only).** When the source can be stopped for the
window, `EYE_BACKUP_QUIESCE_NOTE="…"` records that it was, and the manifest's
guarantee reads:

```
COHERENT WINDOW: the recorded boundary did not move between the first and the last artefact,
so the dumps, the vault tar and the journal tar describe one state.
```

Otherwise:

```
BOUNDED RECONCILIATION: each dump is internally consistent (one pg_dump snapshot per database)
and the boundary is recorded on both sides; restore enumerates everything admitted after
boundary_before and reports what falls outside the bundle.
```

**The live deployment is never quiesced.** For it the guarantee is the bounded
one, and it is honest: `pg_dump` gives each database one snapshot, and the window
around the vault and journal is recorded and reconciled rather than assumed away.

**Restore reconciles.** It enumerates every audit event beyond its partition's
recorded head and every blob manifest newer than the recorded newest one, checks
each such manifest's bytes in the restored vault, and **names** those that have
none:

```
==> capture-boundary reconciliation: what the source admitted after the boundary the bundle records
  <db>: N audit event(s) and M blob manifest(s) admitted after the boundary; of the live ones
        X/Y have their bytes in the bundle, Z do not
  <db>: the following fall OUTSIDE the bundle and must be re-collected or accepted as lost:
        <manifest id>  <vault>/<locator>  admitted <timestamp>
```

The same window rule governs the count and chain-head checks. A `pg_dump`
snapshot is taken at an instant *inside* the window, so a monotonically
increasing counter can legitimately land between the two recorded edges; that is
accepted and labelled (`inside the capture window [before, after]`) rather than
failed, and chain heads are accepted when every head's `next_seq` lies between
the two edges for its partition — with head *consistency* still proved separately
by `audit.rebuild_chain_heads() would change 0 unfrozen heads`.

## 20. Scheduler reconstruction with collection ENABLED

§3 argues that Redis holds nothing that cannot be rebuilt. The fourth drill
proves it with collection **on**, against a **fresh, empty** isolated Redis.

The phase runs at the end of `restore.sh --into-isolated`
(`EYE_RESTORE_SCHEDULER_PHASE=0` skips it) and does this:

1. checks the isolated Redis was **empty** when it started (`dbsize` = 0
   immediately after the container came up — nothing Redis-shaped is restored
   from a bundle);
2. reads what the DATABASE holds: `observation.scheduler_entries` (all of them),
   how many are **eligible** by migration 0038's own predicate
   (`status='scheduled'`, contract `active`, `acquisition_mode='live'`, rights
   `confirmed`, an active agent for the connector), the row count of
   `observation.scheduled_attempts`, and the rooms carrying a review cadence;
3. **pauses** the collection and briefing queues **before** the API starts.
   BullMQ 6 produces an `every` scheduler's first job with delay 0 — as
   `SCHEDULED_COLLECTION.md` §3.3 already records — so a reconstruction on an
   unpaused queue starts collecting the instant the workers come up. Pausing
   first is what makes the reconstruction observable without executing anything;
4. starts the **verified artifact** with `EYE_SCHEDULER_ENABLED=true` and checks:
   every eligible entry present in Redis with the cadence the database stores, no
   ineligible entry present, the collection worker up, the attempt history intact
   from the database alone, and the room briefing cadence reconciled from
   `executive.briefings_to_reconcile()`;
5. **bounds egress** while everything is still paused: it keeps exactly ONE
   source's job scheduler and removes every other scheduler **and every job those
   schedulers had produced**, then verifies no foreign collection job remains;
6. resumes the **collection** queue only (the briefing queue stays paused; its
   reconstruction is what was being proved, not its agent) and waits for the
   attempt row.

**About egress.** A replay/upload source **cannot** be used here:
`observation.schedules_to_reconcile()` requires `acquisition_mode = 'live'`, so a
replay-mode contract is never reconstructed into the scheduler at all. The bound
is therefore a single named live contract, and the receipt states which source
was kept, which were removed, and what the run actually did — including the case
where the run is refused by governance before it opens, in which the connector
never runs and no external request is issued:

```
EGRESS ACTUALLY MADE: none. The run was REFUSED by governance before it opened (…),
so the connector never ran and no external request was issued.
```

`EYE_RESTORE_TICK_SOURCE=<source id>` chooses the kept source explicitly;
otherwise the eligible source with the shortest cadence is used.

## 21. Fourth drill — CP-4/5 (2026-09-10, 22:38–22:40 UTC)

Full record: `docs/ops/evidence/restore-drill-20260910T223824Z.md`. Guard
probes: `docs/ops/evidence/guard-probes-20260910T223824Z.txt` (51 probes, 51
passed). The three earlier drill records and their results (37/37 and 44/44)
are unchanged.

One run, four stages that build on each other, so that §§16–20 are evidenced
**together** rather than one at a time:

| # | stage | duration | result |
| --- | --- | --- | --- |
| 1 | `backup.sh`, LIVE source → bundle `L` (`20260910T223824Z`) | 18 s (build 7.6 s) | 143,300 KB, sealed, build `sha256:4bb050f7…` of `ef85a128` |
| 2 | `restore.sh L --into-isolated --keep` → isolated `E1` | 26 s | 56 passed, 1 failed |
| 3 | `E1` driven into a degraded state by the deployment's own writer | ~35 s | 3 journal records, 3 governed availability incidents |
| 4 | `backup.sh`, ISOLATED source `E1`, **quiesced** → bundle `D` (`20260910T223914Z`) | 17 s (build 7.2 s) | non-empty `journal.tar`, coherent window |
| 5 | `E1` torn down through its run manifest | <1 s | 2 containers, 1 volume, by recorded id |
| 6 | `restore.sh D --into-isolated --keep` → `E2` — **the drill restore** | 29 s | **68 passed, 1 failed** |
| 7 | governed recovery on `E2` (`reconcile-degraded.js`) + restart | ~25 s | 3 incidents reconciled, `degraded_recovered` written, `/readyz` `ok` after restart |
| 8–9 | teardown; the live deployment after | <5 s | 0 `eye-restore-*`/`eye-cp45-*` left; `eye-postgres`/`eye-redis` same ids and same `StartedAt` |
| 10 | `scripts/ops/test-guards.sh` | ~20 s | **51 passed, 0 failed** |

What the drill established, in one line each:

- **Build identity.** The bundle carries and identifies its artifact
  (`sha256:4bb050f7…`, 367 files, from `ef85a128` with a frozen
  `pnpm-lock.yaml` `024f2bbc…`, node v24.11.1 / pnpm 11.9.0, built 22:38:25Z →
  22:38:32Z), the restore re-digests what it is about to start, and the target
  host's own `apps/api/dist` (`sha256:3feb6d5d…`, rebuilt during the drill by a
  concurrent session) was recorded as a **source-to-target upgrade** instead of
  being started silently.
- **Encryption.** All seven payload files sealed with AES-256-GCM under a
  per-bundle key wrapped by `EYE_BACKUP_PASSPHRASE`; no plaintext on disk; the
  passphrase verified before any ciphertext was read; every file re-hashed after
  decryption inside the restore root.
- **Degraded journal.** Three real `audit_unavailable` records, written by
  `AuthController.auditUnavailable` after `identity.auth_lookup(text)` was
  revoked from `eye_identity` **in the isolated database only** and three
  well-formed logins were refused `503 EYE-INT-001`; restored, replayed
  (`/readyz` `degraded`, 6 unreconciled = 3 journal + 3 ledger, same
  `degradedSince`), reconciled by the governed entrypoint, and `ok` again after a
  restart.
- **Coherent capture.** `L` and `D` both came out `capture.stable = true`; `D`
  additionally quiesced. Restore enumerated everything past the boundary (1
  pre-existing orphan audit row in `eye`, 0 rows without bytes).
- **Scheduler.** Redis empty (0 keys) → 5/5 eligible schedules reconstructed from
  `observation.scheduler_entries` with the stored cadences, 2 correctly not
  reconstructed (replay-mode), the worker up, 97 attempts intact, the room
  briefing cadence reconciled, and **exactly one** tick served and recorded
  (97 → 98) with **no external request issued**.

The single failing check, in both restores, is the governed read: the
administrator password in `.eye-local/env` is refused `EYE-IDN-002` by the
`platform-admin` principal restored from the same bundle. The database roles were
realigned with the file; the application principal was not. See the drill record
§6 and §8 — it is a repair the deployment needs, not something a backup script
can supply.
