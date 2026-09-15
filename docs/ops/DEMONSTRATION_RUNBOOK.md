# The NORDWERK demonstration — the operator's runbook

How the demonstration service is restarted, migrated and rehearsed without changing what it serves. Written after the
restart incident of 2026-09-13 (§6; PHASE6_REPORT §24.3), which Codex's B11 review asked to be carried here: a future
restart must select the demonstration's database and vault roots explicitly and verify the running target, and the
Phase 0 bootstrap script must never be used as a restart.

## 1. What the demonstration is

| Part | Value | Why it matters |
|---|---|---|
| Database | `eye_demo` in the `eye-postgres` container — **not** the default `eye` | `eye` is the Phase 0 bootstrap database: 66 audit-integrity incidents on record, so an API serving it reports `/readyz` `degraded` |
| API | `apps/api/dist/main.js` on **:3401**; `EYE_DB_NAME=eye_demo`; the scheduler **enabled** (`EYE_SCHEDULER_ENABLED=true`, one job per source queue); `EYE_DEGRADED_DIR=apps/api/.eye-local/degraded-demo` | persisted schedules reconcile at start against the agents on record; the degraded journal is the demonstration's own |
| Vault | `.eye-local/vault/{quarantine,evidence,archive,export}`, relative to the repository root — the roots the process runs with when no `EYE_VAULT_*_ROOT` is set (`apps/api/src/config/config.ts` resolves a relative root against the workspace root, not the process's cwd) | an archive **moves** bytes and a deletion removes them: the roots of the running process are where the demonstration's evidence lives |
| Web | `apps/web` on :3000 (the `eye-web` launch configuration) | |
| Redis | the `eye-redis` container | queues only — rebuildable (BACKUP_RESTORE.md §3) |
| Local secrets | `.eye-local/env`, mode 0600, never committed; a source credential is one `EYE_SRC_<NAME>=…` line there | a changed env file binds nothing until the API is **restarted** with it: readiness reads the running process, not the file |

## 2. Restart — `scripts/ops/demo-restart.sh`

```bash
scripts/ops/demo-restart.sh
```

The script loads `.eye-local/env`, sets the demonstration's identity (the database, the degraded directory, the scheduler,
the per-source concurrency), stops the API listening on :3401 if there is one, starts `apps/api/dist/main.js`, waits for
`/readyz`, and then **verifies the running target** before it reports success: the process's `EYE_DB_NAME`, its vault roots
(or the statement that the workspace roots apply), the scheduler flag, and `/readyz` reading `ok`. It exits non-zero when
the process serves any database but `eye_demo` or is not ready. `--build` rebuilds `apps/api` first (after a code change);
`--verify-only` checks the running process and restarts nothing. `EYE_DEMO_PORT` and `EYE_DEMO_DB_NAME` retarget the
script at a rehearsal copy (the port is passed to the process it starts as `EYE_RUNTIME_PORT`). Nothing it prints is a
credential.

```bash
scripts/ops/demo-restart.sh --verify-only
```

is the check to run whenever the demonstration's state is in doubt — before an act, after any host activity that could
have started an API, and in every act's first lines.

## 3. What must not be used as a restart

`scripts/demo.sh` is the **Phase 0 bootstrap**: fresh containers, a regenerated local secret handoff, migrations on the
**default** database `eye`, the audited bootstrap, an API on :3401 against `eye`, the Phase 0 acceptance suite. It is the
right script for a fresh stack and the wrong one for a running demonstration: it replaces the demonstration process with
one that serves `eye` (see §6). Nothing in it names `eye_demo`.

## 4. Migrating the demonstration (a new batch)

1. **Back up first.** `scripts/ops/backup.sh` (BACKUP_RESTORE.md §4) for the whole runtime state, or at least
   `docker exec eye-postgres pg_dump -U eye -Fc eye_demo > <dated file>` — the act records the path and size.
2. **Stop the API**, then migrate through the migrator with the demonstration named. The migrator reads the process
   environment only, so the local secret handoff is sourced first:
   `set -a; . .eye-local/env; set +a; (cd apps/api && EYE_DB_NAME=eye_demo node scripts/migrate.mjs)`.
3. **Rebuild** what changed: `pnpm --filter @eye/api build`; `pnpm --filter @eye/web build` when a page changed.
4. **Restart with the verification**: `scripts/ops/demo-restart.sh` (or `--build` to fold step 3 in).
5. When a connector's **code digest** changed, the agents registered against the previous digest stop matching
   (SOURCE_INTEGRATION_STATUS §9.11.10): `node scripts/integrations/reprovision-rest-agents.mjs`, then restart once more so
   the scheduler reconciles the persisted schedules to the new agents.

## 5. Rehearsing an act

An act is rehearsed on a **restored copy** before it runs on the demonstration: `eye_demo` restored into a disposable
database, the vault copied to a scratch directory and the API started on another port with `EYE_DB_NAME=<the copy>`
and all four `EYE_VAULT_*_ROOT` pointing at the copy — an archive moves bytes and a deletion removes them, so a rehearsal
on the demonstration's roots would move the demonstration's evidence. The copy is dropped and restored again between
rehearsals (terminate its backends first). The rehearsal's API is stopped by its port before the demonstration's act.

## 6. The incident — 2026-09-13T19:59Z

`scripts/demo.sh` was run on the host outside the author's session (its log at `/tmp/eye-api.log`). It rebuilt `dist`,
migrated the default database `eye` through 0070 (the local env names no `EYE_DB_NAME`), and started an API on :3401
against `eye` — the Phase 0 database with 66 audit-integrity incidents on record, so `/readyz` read `degraded` — replacing
the demonstration process that served `eye_demo`; its web start on :3000 exited 143 (the port held) and was restarted.
On 2026-09-14T16:20Z the demonstration API was restarted on `eye_demo` (`/readyz` ok, 0 incidents) with the same `dist`.
`eye_demo` itself was not touched by that run: its migrations, rows and vault were as the B11 act left them. What the
incident showed: a restart that does not name its target lands on the default, and a restart that does not verify its
target reports nothing wrong. §2's script does both; §3 names what not to run.

**The second incident — 2026-09-15T17:31Z (the B12 act).** The act ran `scripts/ops/demo-restart.sh --build 2>&1 | sed …` to
capture the restart into the evidence file. The API came up on the B12 build and the script's verification passed, but the
capture never received its output: the script detached the API by calling a bash FUNCTION in the background, which leaves a
bash subshell alive as the API's parent holding the saved copies of the script's stdout for the API's lifetime — the pipe
never closes, the caller waits. The earlier acts had piped the script the same way and happened not to block. Corrected: the
forked subshell now `exec`s the API (`( cd apps/api && exec nohup node dist/main.js >> "$LOG" 2>&1 < /dev/null ) &`), so
nothing of the caller's reaches the API (bash's internal descriptors are close-on-exec); the restart was repeated by the
corrected script inside the act. What it showed: a restart script is part of the evidence path and is exercised under a
pipe like any other command.

**Left on the demonstration by the B12 act (2026-09-15):** an ARCHIVE schedule of profile "24 months" for the source
`nordwerk-internal` (due after 0 seconds). A schedule acts only on an evaluation (`/schedules/evaluate`, the steward's act):
an evaluation opens archive actions for that source's hot records past their due (all of them, under the sane policy's 200
opens per evaluation; a restored record only after the 30-day restore window) — opened only; nothing moves without the
authority's approval and the steward's execution. No route retires a schedule (recorded as a follow-up); until one exists,
retire it by SQL on `eye_demo` (`UPDATE retention.schedules SET state = 'retired' WHERE schedule_id = …`) if an evaluation
must not open those actions.

## 7. Reading the running target by hand

The process environment is read on macOS with `ps -E -p <pid> -o command=` and on Linux from `/proc/<pid>/environ`,
filtered to the demonstration's non-secret settings: `EYE_DB_NAME`, `EYE_VAULT_*_ROOT`, `EYE_SCHEDULER_ENABLED`,
`EYE_DEGRADED_DIR`, `EYE_CONNECTOR_PER_SOURCE_CONCURRENCY`. `/readyz` says whether the process is connected and whether
the audit chain is clean (`auditIncidents`), not which database it serves — the environment says that. No value of a
credential is printed by the script or should be by hand.
