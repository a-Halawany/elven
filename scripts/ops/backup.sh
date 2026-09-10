#!/usr/bin/env bash
# The Eye — runtime-state backup (delivery package R0/P7-D, "Vault, database and
# credential recovery"). Answers the .eye-local loss of 2026-09-09.
#
# Produces ONE timestamped bundle directory under
#   ${EYE_BACKUP_ROOT:-$HOME/eye-backups}/<UTC timestamp>/
# containing everything a coherent restore needs (docs/ops/BACKUP_RESTORE.md):
#   pg/eye.dump, pg/eye_demo.dump   pg_dump -Fc, streamed out of eye-postgres to the host
#   pg/globals.sql                  pg_dumpall --globals-only (roles + their SCRAM verifiers)
#   vault.tar                       .eye-local/vault/{quarantine,evidence}, paths relative to the repo root
#   journal.tar                     the degraded-audit journals (demo + dev default dir)
#   config/env                      a byte copy of .eye-local/env, mode 0600
#   MANIFEST.json                   sha256 of every file, git HEAD, per-database counts and audit heads,
#                                   the compose pins of BOTH services (by service identity) and the image digests
#   RUN.json                        the run manifest: every directory this run created (cleanup is bound to it)
#
# DESTINATION GUARDS (scripts/ops/lib/guards.sh) run FIRST, before the credential
# file is read and before any chmod, copy or write: EYE_BACKUP_ROOT must already
# exist, be a directory, not be a symlink, and its PHYSICAL path (symlinks
# resolved) must not be inside, equal to, or an ancestor of the repository
# worktree, .eye-local, apps/api/.eye-local or a compose bind-mount host path.
# The bundle directory is created fresh (plain mkdir; it must not exist).
#
# READ-ONLY AGAINST THE LIVE DEPLOYMENT. This script only runs `docker exec` /
# `docker inspect` against eye-postgres and reads files; it never stops, restarts
# or modifies a container, a volume, a database, .eye-local/ or apps/api/.eye-local/.
#
# NO SECRET IS EVER PRINTED. .eye-local/env is loaded with `set -a; . env; set +a`
# and copied as a whole file; nothing else touches its values. Do not add `set -x`.
set -euo pipefail
set +x
umask 077

REPO="$(cd -P "$(dirname "$0")/../.." && pwd -P)"
# shellcheck source=lib/guards.sh
. "$REPO/scripts/ops/lib/guards.sh"
ENV_FILE="$REPO/.eye-local/env"
COMPOSE_FILE="$REPO/docker-compose.yml"
PG_SERVICE="postgres"; REDIS_SERVICE="redis"
PG_SUPERUSER="${EYE_DB_MIGRATE_USER:-eye}"
DATABASES="eye eye_demo"
VAULT_REL=".eye-local/vault"
JOURNAL_DIRS="apps/api/.eye-local/degraded-demo apps/api/.eye-local/degraded"

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'backup: %s\n' "$*" >&2; exit 1; }
now_s() { date -u +%s; }
sha()  { ops_sha256 "$1"; }
size() { wc -c < "$1" | tr -d ' '; }

# ------------------------------------------------ destination guards (first)
step "destination guards (physical paths; before any read of the credential file or any write)"
command -v docker >/dev/null || die "docker is required"
command -v jq >/dev/null || die "jq is required"
command -v node >/dev/null || die "node is required (docker-compose.yml is read by service identity through scripts/ops/compose-services.mjs)"
[[ -f "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE is missing"
COMPOSE_JSON="$(node "$REPO/scripts/ops/compose-services.mjs" "$COMPOSE_FILE")" || die "docker-compose.yml could not be parsed"
PROTECTED="$(ops_protected_paths "$REPO")"
say "  protected (physical): $(printf '%s' "$PROTECTED" | tr '\n' ' ')"
BACKUP_ROOT="${EYE_BACKUP_ROOT:-$HOME/eye-backups}"
V="$(ops_require_existing_dir "EYE_BACKUP_ROOT" "$BACKUP_ROOT")" || die "$V"
say "  $V"
# shellcheck disable=SC2086
V="$(ops_guard_destination "EYE_BACKUP_ROOT" "$BACKUP_ROOT" $PROTECTED)" || die "$V"
say "  $V"
BACKUP_ROOT="$(ops_phys "$BACKUP_ROOT")"
[[ "$(ops_mode "$BACKUP_ROOT")" == "700" ]] || say "  note: $BACKUP_ROOT is mode $(ops_mode "$BACKUP_ROOT"), not 0700 (the bundle itself is created 0700; the root's mode is the operator's)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
B="$BACKUP_ROOT/$TS"
# shellcheck disable=SC2086
V="$(ops_guard_destination "bundle" "$B" $PROTECTED)" || die "$V"
say "  $V"

# ---------------------------------------------------------------- preflight
step "preflight (read-only against the $PG_SERVICE service's container)"
PG_CONTAINER="$(jq -r --arg s "$PG_SERVICE" '.services[$s].container_name // empty' <<<"$COMPOSE_JSON")"
REDIS_CONTAINER="$(jq -r --arg s "$REDIS_SERVICE" '.services[$s].container_name // empty' <<<"$COMPOSE_JSON")"
[[ -n "$PG_CONTAINER" && -n "$REDIS_CONTAINER" ]] || die "docker-compose.yml does not name container_name for services $PG_SERVICE and $REDIS_SERVICE"
PG_PIN="$(jq -r --arg s "$PG_SERVICE" '.services[$s].image // empty' <<<"$COMPOSE_JSON")"
REDIS_PIN="$(jq -r --arg s "$REDIS_SERVICE" '.services[$s].image // empty' <<<"$COMPOSE_JSON")"
[[ -n "$PG_PIN" && -n "$REDIS_PIN" ]] || die "docker-compose.yml does not pin an image for services $PG_SERVICE and $REDIS_SERVICE"
say "  services: $PG_SERVICE -> $PG_CONTAINER, $REDIS_SERVICE -> $REDIS_CONTAINER"
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE is missing — nothing to back up coherently (the credentials ARE part of the runtime state)"
[[ "$(ops_mode "$ENV_FILE")" == "600" ]] || die "$ENV_FILE is not mode 0600; refusing to copy a permissive secret file"
docker inspect --format '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -q true || die "$PG_CONTAINER is not running"
docker inspect --format '{{.State.Running}}' "$REDIS_CONTAINER" 2>/dev/null | grep -q true || say "note: $REDIS_CONTAINER is not running (Redis holds no durable state; continuing)"

# Load the secret handoff into this process only. Values are used solely as
# docker exec environment (PGPASSWORD) and are never echoed.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[[ -n "${EYE_DB_PASSWORD:-}" ]] || die "EYE_DB_PASSWORD is not in the handoff"
export PGPASSWORD="${EYE_DB_MIGRATE_PASSWORD:-$EYE_DB_PASSWORD}"

psq() { # psq <db> <sql>  — one value per line, no headers, superuser, read-only use only
  docker exec -e PGPASSWORD "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$1" -v ON_ERROR_STOP=1 -X -A -t -c "$2"
}
docker exec "$PG_CONTAINER" pg_isready -U "$PG_SUPERUSER" -d postgres -q || die "$PG_CONTAINER is not ready"
for db in $DATABASES; do
  [[ "$(psq postgres "select count(*) from pg_database where datname='$db'")" == "1" ]] || die "database $db does not exist"
done

# ------------------------------------------------- bundle directory (fresh)
step "bundle directory (fresh; cleanup on failure is bound to the run manifest)"
V="$(ops_mkdir_fresh "bundle" "$B")" || die "$V"
say "  $V"
ops_run_init "$B/RUN.json" "backup.sh"
ops_run_record dir "$B" "bundle"
chmod 700 "$B"
cleanup_on_failure() {
  # Only directories this run created (recorded in RUN.json) are removed; a
  # partial bundle would otherwise leave a copy of the credentials behind.
  local d
  for d in $(ops_run_ids dir | sort -r); do
    [[ -d "$d" && ! -L "$d" ]] || continue
    rm -rf "$d"; say "  removed partial $d (recorded in the run manifest)"
  done
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then step "failure (rc=$rc): removing what this run created"; cleanup_on_failure; fi; exit $rc' EXIT
mkdir "$B/pg" "$B/config"
ops_run_record dir "$B/pg" ""; ops_run_record dir "$B/config" ""
say "  bundle: $B"
say "  repository: $REPO @ $(git -C "$REPO" rev-parse HEAD) ($(git -C "$REPO" branch --show-current))"
T0=$(now_s)

# ------------------------------------------------- per-database facts (JSON)
# The audit head per partition is the ledger's own claim of what the chain ends
# in; restore verifies the restored ledger reaches exactly these heads.
db_facts() { # db_facts <db>  -> one JSON object
  local db="$1"
  psq "$db" "select json_build_object(
    'schema_migrations_count', (select count(*) from public.schema_migrations),
    'last_migration',          (select max(filename) from public.schema_migrations),
    'canonical_objects',       (select count(*) from objects.canonical_objects),
    'audit_events',            (select count(*) from audit.audit_events),
    'audit_seals',             (select count(*) from audit.audit_seals),
    'integrity_incidents',     (select count(*) from audit.integrity_incidents),
    'audit_partitions',        (select count(*) from audit.audit_chain_heads),
    'audit_heads',             (select coalesce(json_agg(json_build_object(
                                  'partition_id', partition_id, 'next_seq', next_seq,
                                  'head_hash', head_hash, 'frozen', frozen) order by partition_id), '[]'::json)
                                from audit.audit_chain_heads),
    'blob_manifests',          (select coalesce(json_object_agg(vault, n), '{}'::json)
                                from (select vault, count(*) n from observation.blob_manifests group by vault) v),
    'blob_manifests_live',     (select count(*) from observation.blob_manifests m
                                where not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)),
    'blob_tombstones',         (select count(*) from observation.blob_tombstones),
    'size_bytes',              pg_database_size('$db'),
    'server_version',          current_setting('server_version')
  )::text"
}

step "recording database facts before the dumps"
FACTS_BEFORE="{}"
for db in $DATABASES; do
  f="$(db_facts "$db")"
  FACTS_BEFORE="$(jq -c --arg db "$db" --argjson f "$f" '. + {($db): $f}' <<<"$FACTS_BEFORE")"
  say "  $db: migrations=$(jq -r '.schema_migrations_count' <<<"$f") last=$(jq -r '.last_migration' <<<"$f") canonical_objects=$(jq -r '.canonical_objects' <<<"$f") audit_events=$(jq -r '.audit_events' <<<"$f") partitions=$(jq -r '.audit_partitions' <<<"$f") manifests=$(jq -c '.blob_manifests' <<<"$f") tombstones=$(jq -r '.blob_tombstones' <<<"$f")"
done

# ------------------------------------------------------------------- dumps
# pg_dump runs INSIDE the container (pg 18 tools against the pg 18 server) and
# streams to the host over docker exec's stdout; nothing is written into the
# container or its volume. Custom format (-Fc) keeps ownership and lets
# pg_restore rebuild in dependency order.
step "pg_dump -Fc (streamed to host)"
for db in $DATABASES; do
  t=$(now_s)
  docker exec -e PGPASSWORD "$PG_CONTAINER" pg_dump -U "$PG_SUPERUSER" -Fc --no-password "$db" > "$B/pg/$db.dump"
  say "  pg/$db.dump  $(size "$B/pg/$db.dump") bytes  $(( $(now_s) - t ))s"
done
step "pg_dumpall --globals-only (roles and their password verifiers; treated as secret material)"
docker exec -e PGPASSWORD "$PG_CONTAINER" pg_dumpall -U "$PG_SUPERUSER" --globals-only --no-password > "$B/pg/globals.sql"
chmod 600 "$B/pg/globals.sql"
say "  pg/globals.sql  $(size "$B/pg/globals.sql") bytes  roles: $(grep -c '^CREATE ROLE' "$B/pg/globals.sql")"

step "recording database facts after the dumps (drift detection; the demo collects hourly)"
FACTS_AFTER="{}"
DRIFT=false
for db in $DATABASES; do
  f="$(db_facts "$db")"
  FACTS_AFTER="$(jq -c --arg db "$db" --argjson f "$f" '. + {($db): $f}' <<<"$FACTS_AFTER")"
  if [[ "$(jq -c --arg db "$db" '.[$db] | del(.size_bytes)' <<<"$FACTS_BEFORE")" != "$(jq -c 'del(.size_bytes)' <<<"$f")" ]]; then
    DRIFT=true; say "  $db: CHANGED during the dump window (restore accepts either the before or the after facts)"
  else
    say "  $db: unchanged during the dump window"
  fi
done

# --------------------------------------------------------- vault + journal
# The dumps are taken FIRST, the vault SECOND: bytes are never rewritten, so
# every manifest present in the dump has bytes in the tar unless it was
# tombstoned in between (restore reports such a case, it does not hide it).
step "vault.tar ($VAULT_REL, paths relative to the repository root)"
[[ -d "$REPO/$VAULT_REL/evidence" && -d "$REPO/$VAULT_REL/quarantine" ]] || die "$VAULT_REL is missing one of its two roots"
tar -C "$REPO" -cf "$B/vault.tar" "$VAULT_REL"
VAULT_FILES=$(find "$REPO/$VAULT_REL" -type f | wc -l | tr -d ' ')
VAULT_BYTES=$(find "$REPO/$VAULT_REL" -type f -print0 | xargs -0 wc -c 2>/dev/null | awk 'END{print $1}')
say "  vault.tar  $(size "$B/vault.tar") bytes  files=$VAULT_FILES payload_bytes=${VAULT_BYTES:-0}"

step "journal.tar (degraded-audit journals)"
JOURNAL_JSON="[]"
JOURNAL_PRESENT=""
for d in $JOURNAL_DIRS; do
  if [[ -d "$REPO/$d" ]]; then
    n=$(find "$REPO/$d" -type f | wc -l | tr -d ' ')
    JOURNAL_PRESENT="$JOURNAL_PRESENT $d"
    JOURNAL_JSON="$(jq -c --arg p "$d" --argjson n "$n" '. + [{path:$p, present:true, files:$n}]' <<<"$JOURNAL_JSON")"
    say "  $d: present, files=$n"
  else
    JOURNAL_JSON="$(jq -c --arg p "$d" '. + [{path:$p, present:false, files:0}]' <<<"$JOURNAL_JSON")"
    say "  $d: absent (the dev profile has not journalled a degraded state)"
  fi
done
if [[ -n "$JOURNAL_PRESENT" ]]; then
  # shellcheck disable=SC2086
  tar -C "$REPO" -cf "$B/journal.tar" $JOURNAL_PRESENT
else
  tar -cf "$B/journal.tar" -T /dev/null
fi
say "  journal.tar  $(size "$B/journal.tar") bytes"

step "config/env (byte copy, 0600 — never displayed)"
cp "$ENV_FILE" "$B/config/env"
chmod 600 "$B/config/env"
cmp -s "$ENV_FILE" "$B/config/env" || die "config/env copy does not match the source"
say "  config/env  $(size "$B/config/env") bytes  keys=$(grep -c '^[A-Z0-9_]*=' "$B/config/env")"

# ------------------------------------------------------------------ images
# The pin of each service is read from docker-compose.yml BY SERVICE IDENTITY
# (services.postgres.image, services.redis.image), whatever registry or path the
# reference carries; both pins are recorded so that restore can start its
# isolated container from the bundle's own recorded pin.
step "image pins (by compose service identity) and the running containers' digests"
img_json() { # img_json <service> <container> <compose-pin>
  local svc="$1" c="$2" pin="$3" id digests
  id="$(docker inspect --format '{{.Image}}' "$c")"
  digests="$(docker image inspect --format '{{join .RepoDigests ","}}' "$id")"
  jq -cn --arg svc "$svc" --arg c "$c" --arg id "$id" --arg d "$digests" --arg pin "$pin" '
    ($pin | split("@") | .[1] // "") as $pindigest
    | {service:$svc, container:$c, image_id:$id, repo_digests:($d|split(",")), compose_pin:$pin,
       compose_pin_digest:$pindigest,
       pin_matches:(($d|split(","))|index($pin)!=null),
       pin_digest_matches:(($d|split(",")|map(split("@")|.[1] // "")|index($pindigest))!=null)}'
}
PG_IMG="$(img_json "$PG_SERVICE" "$PG_CONTAINER" "$PG_PIN")"
REDIS_IMG="$(img_json "$REDIS_SERVICE" "$REDIS_CONTAINER" "$REDIS_PIN")"
say "  $PG_SERVICE: pin $PG_PIN"
say "    running: $(jq -r '.repo_digests|join(" ")' <<<"$PG_IMG")  pin_matches=$(jq -r '.pin_matches' <<<"$PG_IMG") pin_digest_matches=$(jq -r '.pin_digest_matches' <<<"$PG_IMG")"
say "  $REDIS_SERVICE: pin $REDIS_PIN"
say "    running: $(jq -r '.repo_digests|join(" ")' <<<"$REDIS_IMG")  pin_matches=$(jq -r '.pin_matches' <<<"$REDIS_IMG") pin_digest_matches=$(jq -r '.pin_digest_matches' <<<"$REDIS_IMG")"

# --------------------------------------------------------------- manifest
step "MANIFEST.json"
FILES_JSON="{}"
for f in pg/eye.dump pg/eye_demo.dump pg/globals.sql vault.tar journal.tar config/env; do
  FILES_JSON="$(jq -c --arg f "$f" --arg s "$(sha "$B/$f")" --argjson b "$(size "$B/$f")" '. + {($f): {sha256:$s, bytes:$b}}' <<<"$FILES_JSON")"
done
T1=$(now_s)
BUNDLE_KB=$(du -sk "$B" | awk '{print $1}')
GIT_HEAD="$(git -C "$REPO" rev-parse HEAD)"
COMPOSE_CLEAN=true
git -C "$REPO" diff --quiet -- docker-compose.yml 2>/dev/null || COMPOSE_CLEAN=false
jq -n \
  --arg ts "$TS" --arg host "$(hostname)" --arg repo "$REPO" \
  --arg head "$GIT_HEAD" --arg branch "$(git -C "$REPO" branch --show-current)" \
  --argjson duration "$(( T1 - T0 ))" --argjson kb "$BUNDLE_KB" \
  --argjson files "$FILES_JSON" --argjson before "$FACTS_BEFORE" --argjson after "$FACTS_AFTER" --argjson drift "$DRIFT" \
  --argjson pg "$PG_IMG" --argjson redis "$REDIS_IMG" \
  --arg csha "$(sha "$COMPOSE_FILE")" --argjson cclean "$COMPOSE_CLEAN" --arg pgsvc "$PG_SERVICE" --arg rsvc "$REDIS_SERVICE" \
  --arg vault "$VAULT_REL" --argjson vfiles "$VAULT_FILES" --argjson vbytes "${VAULT_BYTES:-0}" \
  --argjson journal "$JOURNAL_JSON" --arg dbs "$DATABASES" --arg su "$PG_SUPERUSER" \
  '{
    format: "eye-backup-bundle/1",
    bundle: {created_at_utc:$ts, host:$host, repository:$repo, git_head:$head, git_branch:$branch,
             backup_duration_seconds:$duration, bundle_size_kb:$kb, superuser_role:$su},
    databases: ($dbs|split(" ")),
    files: $files,
    database_facts: {before_dump:$before, after_dump:$after, changed_during_dump_window:$drift},
    compose: {file:"docker-compose.yml", sha256:$csha, unmodified_in_worktree:$cclean,
              services:{($pgsvc):{image:$pg.compose_pin}, ($rsvc):{image:$redis.compose_pin}}},
    images: {postgres:$pg, redis:$redis},
    vault: {root:$vault, files:$vfiles, payload_bytes:$vbytes},
    journal: $journal,
    redis: {backed_up:false,
            reason:"BullMQ schedulers are reconciled from observation.scheduler_entries / executive.briefings_to_reconcile() at API bootstrap (collection-worker.service.ts, agent-worker.service.ts); the domain-events outbox is durable in the database (outbox.publisher.ts). Redis holds no state that cannot be rebuilt."}
  }' > "$B/MANIFEST.json"
chmod 600 "$B/MANIFEST.json"

say ""
say "bundle complete: $B  ($BUNDLE_KB KB, $(( T1 - T0 ))s)"
jq -r '.files | to_entries[] | "  \(.key)  sha256=\(.value.sha256)  bytes=\(.value.bytes)"' "$B/MANIFEST.json"
say "  MANIFEST.json  sha256=$(sha "$B/MANIFEST.json")"
say "  RUN.json  created: $(jq -r '[.created[] | .kind] | join(",")' "$B/RUN.json")"
