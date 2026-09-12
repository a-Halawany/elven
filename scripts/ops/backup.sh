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
#   runtime-workspace.tar           the DEPENDENCY RECORD: the committed lockfile, the workspace/package manifests and
#                                   packages/contracts/dist, so a restore without the build root installs the
#                                   artifact's dependencies from the bundle itself (frozen lockfile) or refuses
#   api-dist.tar                    the APPLICATION ARTIFACT: the apps/api/dist tree produced by this run's
#                                   build, so the bundle carries the identified build, not a reference to one
#   MANIFEST.json                   sha256 of every file, git HEAD, per-database counts and audit heads,
#                                   the compose pins of BOTH services (by service identity), their declared
#                                   process protections (user / cap_drop / security_opt), the image digests
#                                   and the protections the running containers actually carry, the BUILD
#                                   IDENTITY, the CAPTURE BOUNDARY and the ENCRYPTION descriptor
#   RUN.json                        the run manifest: every directory this run created (cleanup is bound to it)
#
# ── BUILD IDENTITY (CP-4/5 §1). Before anything is dumped, the API is built from the
# COMMITTED tree at the current git SHA (git archive — the worktree is never built and
# never written to) with the committed lockfile (`pnpm install --frozen-lockfile`, then
# `pnpm --filter @eye/api... build`; @eye/api alone cannot compile, it needs
# packages/contracts). The manifest records the SHA, `git status --porcelain`
# cleanliness, the sha256 of pnpm-lock.yaml, a deterministic digest of the produced
# apps/api/dist tree, the node/pnpm versions and the build's start/end
# (scripts/ops/build-identity.mjs). restore.sh REFUSES to start a dist tree whose
# digest is not the recorded one. No test suite is run.
#
# ── CAPTURE BOUNDARY (CP-4/5 §4). The dumps, the vault tar and the journal tar are
# separate moments. A boundary is recorded on BOTH sides of the window — per database
# the current snapshot's xmin/xmax, the audit heads, the newest blob manifest, the
# counts; for the vault a listing digest — so restore can RECONCILE anything admitted
# after it and report exactly what falls outside. When the source is quiesced for the
# window (EYE_BACKUP_QUIESCE_NOTE, only ever done against an ISOLATED source), the two
# boundaries are identical and the manifest says so.
#
# ── ENCRYPTION AT REST (CP-4/5 §2). Every payload file is sealed with AES-256-GCM
# under a per-bundle key wrapped by EYE_BACKUP_PASSPHRASE (read from the environment,
# never printed, never defaulted, never written into the bundle):
# scripts/ops/bundle-crypto.mjs. Only MANIFEST.json and RUN.json stay in the clear, and
# neither holds a secret. Recovery procedure: docs/ops/BACKUP_RESTORE.md §17.
#
# ── ISOLATED SOURCE (drill only). With EYE_BACKUP_SOURCE_ROOT set, the vault, the
# journals and the credential copy are read from that root and the databases from
# EYE_BACKUP_SOURCE_PG_CONTAINER instead of the live deployment. The override is
# REFUSED when the named container is one docker-compose.yml declares, or when the
# source root is inside a protected path — it can only ever point AWAY from the
# deployment. This is how a drill backs up an isolated environment (for example one
# that was driven into a degraded state) without touching the live one.
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
BUNDLE_FORMAT="eye-backup-bundle/2"
# The base directory the vault, the journals and the credential copy are read from.
# $REPO is the live deployment; EYE_BACKUP_SOURCE_ROOT points at an isolated one.
SOURCE_ROOT="${EYE_BACKUP_SOURCE_ROOT:-$REPO}"
SOURCE_LABEL="${EYE_BACKUP_SOURCE_LABEL:-live deployment ($REPO)}"

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
command -v pnpm >/dev/null || die "pnpm is required (the bundle records the identity of a build made with the committed lockfile)"
[[ -f "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE is missing"
COMPOSE_JSON="$(node "$REPO/scripts/ops/compose-services.mjs" "$COMPOSE_FILE")" || die "docker-compose.yml could not be parsed"
PROTECTED="$(ops_protected_paths "$REPO")"
say "  protected (physical): $(printf '%s' "$PROTECTED" | tr '\n' ' ')"

# ------------------------------------------------ source (live, or isolated)
# The default source is the live deployment. An override may only point AWAY from
# it: the container it names must not be one docker-compose.yml declares, and the
# source root must not be inside, equal to, or an ancestor of a protected path.
COMPOSE_CONTAINERS="$(jq -r '.services | to_entries[] | .value.container_name // empty' <<<"$COMPOSE_JSON")"
PG_SERVICE_CONTAINER="$(jq -r --arg s "$PG_SERVICE" '.services[$s].container_name // empty' <<<"$COMPOSE_JSON")"
REDIS_SERVICE_CONTAINER="$(jq -r --arg s "$REDIS_SERVICE" '.services[$s].container_name // empty' <<<"$COMPOSE_JSON")"
SOURCE_IS_LIVE=true
if [[ -n "${EYE_BACKUP_SOURCE_ROOT:-}" || -n "${EYE_BACKUP_SOURCE_PG_CONTAINER:-}" ]]; then
  SOURCE_IS_LIVE=false
  [[ -n "${EYE_BACKUP_SOURCE_ROOT:-}" ]] || die "EYE_BACKUP_SOURCE_PG_CONTAINER without EYE_BACKUP_SOURCE_ROOT: an isolated source needs its own vault, journals and credential copy"
  [[ -n "${EYE_BACKUP_SOURCE_PG_CONTAINER:-}" ]] || die "EYE_BACKUP_SOURCE_ROOT without EYE_BACKUP_SOURCE_PG_CONTAINER: an isolated source needs its own database container"
  [[ -n "${EYE_BACKUP_SOURCE_LABEL:-}" ]] || die "EYE_BACKUP_SOURCE_LABEL is required with an isolated source (it is recorded in the manifest so the bundle says what it captured)"
  V="$(ops_require_existing_dir "EYE_BACKUP_SOURCE_ROOT" "$SOURCE_ROOT")" || die "$V"
  say "  $V"
  # shellcheck disable=SC2086
  V="$(ops_guard_destination "EYE_BACKUP_SOURCE_ROOT" "$SOURCE_ROOT" $PROTECTED)" || die "$V"
  say "  $V"
  SOURCE_ROOT="$(ops_phys "$SOURCE_ROOT")"
  for c in "${EYE_BACKUP_SOURCE_PG_CONTAINER:-}" "${EYE_BACKUP_SOURCE_REDIS_CONTAINER:-}"; do
    [[ -n "$c" ]] || continue
    if printf '%s\n' "$COMPOSE_CONTAINERS" | grep -qx "$c"; then
      die "refused: EYE_BACKUP_SOURCE_* names $c, which docker-compose.yml declares — the source override may only point AWAY from the live deployment"
    fi
  done
  say "  source: ISOLATED — root $SOURCE_ROOT, postgres container ${EYE_BACKUP_SOURCE_PG_CONTAINER}, label: $SOURCE_LABEL"
  say "  (the live containers $PG_SERVICE_CONTAINER / $REDIS_SERVICE_CONTAINER are not read by this run)"
else
  say "  source: LIVE — $SOURCE_LABEL"
fi
ENV_FILE="${EYE_BACKUP_SOURCE_ENV:-$SOURCE_ROOT/.eye-local/env}"
[[ "$SOURCE_IS_LIVE" == "true" || -n "${EYE_BACKUP_SOURCE_ENV:-}" ]] || ENV_FILE="$SOURCE_ROOT/config/env"

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

# The passphrase is demanded after the DESTINATION GUARDS (which keep their place
# as the first thing that runs) and before the credential file is read or anything
# is written: a bundle that cannot be sealed must not exist in the clear even for a
# moment. This check reads nothing and writes nothing.
[[ -n "${EYE_BACKUP_PASSPHRASE:-}" ]] || die "EYE_BACKUP_PASSPHRASE is not set in the environment.
  Every bundle is encrypted at rest (AES-256-GCM, per-bundle key wrapped under this passphrase).
  It is never defaulted, never printed and never written into the bundle.
  Supply it from the operator's password store, for example:
    EYE_BACKUP_PASSPHRASE=\"\$(security find-generic-password -w -s eye-backup)\" scripts/ops/backup.sh
  Recovery procedure and what happens if it is lost: docs/ops/BACKUP_RESTORE.md §17."

# ---------------------------------------------------------------- preflight
step "preflight (read-only against the $PG_SERVICE service's container)"
PG_CONTAINER="${EYE_BACKUP_SOURCE_PG_CONTAINER:-$PG_SERVICE_CONTAINER}"
REDIS_CONTAINER="${EYE_BACKUP_SOURCE_REDIS_CONTAINER:-$REDIS_SERVICE_CONTAINER}"
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
# The bundle directory is created BEFORE the run manifest exists (the manifest lives
# inside it), so it is the one directory recorded after the fact — by the mkdir that
# just succeeded here, with the inode that mkdir produced.
V="$(ops_mkdir_fresh "bundle" "$B")" || die "$V"
say "  $V"
chmod 700 "$B"
ops_run_init "$B/RUN.json" "backup.sh"
jq --arg i "$B" --arg n "$(ops_inode "$B")" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.created += [{kind:"dir", id:$i, detail:"bundle", inode:$n, at:$t}]' "$B/RUN.json" > "$B/RUN.json.tmp" && chmod 600 "$B/RUN.json.tmp" && mv "$B/RUN.json.tmp" "$B/RUN.json"
cleanup_on_failure() {
  # Only directories this run CREATED are removed — recorded by their creation
  # (ops_run_create_dir) and still the same inode (ops_run_owned_dirs). A path
  # this run merely named, or one replaced underneath it, is not its to remove.
  # A partial bundle would otherwise leave a copy of the credentials behind.
  local d
  for d in $(ops_run_owned_dirs); do
    rm -rf "$d"; say "  removed partial $d (created by this run; recorded in the run manifest)"
  done
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then step "failure (rc=$rc): removing what this run created"; cleanup_on_failure; fi; exit $rc' EXIT
V="$(ops_run_create_dir "bundle/pg" "$B/pg")" || die "$V"
V="$(ops_run_create_dir "bundle/config" "$B/config")" || die "$V"
say "  bundle: $B"
say "  repository: $REPO @ $(git -C "$REPO" rev-parse HEAD) ($(git -C "$REPO" branch --show-current))"
T0=$(now_s)

# ------------------------------------------------------- build identity (§1)
# The reviewer's finding: reusing apps/api/dist because "no source file is newer
# than the newest dist file" proves nothing about WHICH source and WHICH
# dependencies produced it. So the artifact is BUILT here, from the committed tree
# at the recorded SHA with the committed lockfile, and the bundle carries both the
# identity and the artifact itself (api-dist.tar).
step "build identity: building the API from the committed tree at HEAD with the committed lockfile"
# The build root holds a full checkout and its node_modules (about 1.2 GB), so it
# lives BESIDE the bundles, never inside one; the bundle carries only the produced
# dist tree (api-dist.tar, a few MB) and the identity. The root is guarded like
# every other destination and recorded in the run manifest.
BUILD_PARENT="${EYE_BACKUP_BUILD_ROOT:-$BACKUP_ROOT/builds}"
BUILD_ROOT="$BUILD_PARENT/$TS"
# shellcheck disable=SC2086
V="$(ops_guard_destination "build root" "$BUILD_ROOT" $PROTECTED)" || die "$V"
say "  $V"
[[ -d "$BUILD_PARENT" ]] || { mkdir -p "$BUILD_PARENT" && chmod 700 "$BUILD_PARENT"; }
if [[ "${EYE_BACKUP_SKIP_BUILD:-0}" == "1" ]]; then
  # Deliberate, and it is recorded as such: a bundle without a build identity is a
  # bundle restore cannot bind to an artifact.
  say "  EYE_BACKUP_SKIP_BUILD=1: NOT building; the bundle will record no build identity and restore.sh will refuse to bind an artifact"
  BUILD_IDENTITY='null'
  DIST_MATCHES_RUNNING=null
else
  say "  build root: $BUILD_ROOT (fresh; git archive of $(git -C "$REPO" rev-parse HEAD | cut -c1-12), then pnpm install --frozen-lockfile, then pnpm --filter @eye/api... build)"
  # CREATED here — an atomic plain mkdir that fails if anything is at the path — and
  # recorded only when that mkdir succeeded, so a failed build leaves nothing behind
  # and a directory that already existed is refused WITHOUT ever becoming this run's
  # to remove (R1). The builder is told the root is pre-created and verifies it is an
  # empty directory owned by this user before writing into it.
  V="$(ops_run_create_dir "build root" "$BUILD_ROOT" "build root")" || die "$V"
  say "  $V"
  BUILD_IDENTITY="$(node "$REPO/scripts/ops/build-identity.mjs" build --repo "$REPO" --root "$BUILD_ROOT" --root-precreated)" \
    || die "the build failed; the bundle is not created (see the output above)"
  say "  git sha:        $(jq -r '.git.sha' <<<"$BUILD_IDENTITY")  (worktree clean: $(jq -r '.git.worktree_clean' <<<"$BUILD_IDENTITY"))"
  if [[ "$(jq -r '.git.worktree_clean' <<<"$BUILD_IDENTITY")" != "true" ]]; then
    say "  NOTE: the worktree carries uncommitted changes; the build is of the COMMITTED tree, and the changes are recorded in the manifest:"
    jq -r '.git.worktree_changes[] | "    " + .' <<<"$BUILD_IDENTITY"
  fi
  say "  lockfile:       pnpm-lock.yaml sha256=$(jq -r '.lockfile.sha256' <<<"$BUILD_IDENTITY") (frozen)"
  say "  toolchain:      node $(jq -r '.toolchain.node' <<<"$BUILD_IDENTITY"), pnpm $(jq -r '.toolchain.pnpm' <<<"$BUILD_IDENTITY") on $(jq -r '.toolchain.platform + "/" + .toolchain.arch' <<<"$BUILD_IDENTITY")"
  say "  dist digest:    $(jq -r '.dist.digest' <<<"$BUILD_IDENTITY")  ($(jq -r '.dist.files' <<<"$BUILD_IDENTITY") files, $(jq -r '.dist.bytes' <<<"$BUILD_IDENTITY") bytes)"
  say "  build window:   $(jq -r '.build.started_at_utc' <<<"$BUILD_IDENTITY") -> $(jq -r '.build.ended_at_utc' <<<"$BUILD_IDENTITY") ($(jq -r '.build.duration_seconds' <<<"$BUILD_IDENTITY")s)"
  # Is the build the deployment is RUNNING the same artifact? Reported, never assumed.
  RUNNING_DIST="$REPO/apps/api/dist"
  if [[ -d "$RUNNING_DIST" ]]; then
    if node "$REPO/scripts/ops/build-identity.mjs" --verify "$BUILD_ROOT/BUILD_IDENTITY.json" --dist "$RUNNING_DIST" --entries "$BUILD_ROOT/DIST_ENTRIES.json" > "$B/running-dist-comparison.json" 2>/dev/null; then
      DIST_MATCHES_RUNNING=true
      say "  the deployment's own $RUNNING_DIST has the SAME digest: the running artifact is this commit's build"
    else
      DIST_MATCHES_RUNNING=false
      say "  REPORT: the deployment's own $RUNNING_DIST DIFFERS from this build ($(jq -c '.difference // {}' "$B/running-dist-comparison.json")); the bundle carries the build above"
    fi
  else
    DIST_MATCHES_RUNNING=null
    say "  note: $RUNNING_DIST does not exist; nothing to compare the build against"
  fi
  # The artifact travels WITH the bundle, so a restore is never left looking for it.
  tar -C "$(dirname "$(jq -r '.build.dist_path' <<<"$BUILD_IDENTITY")")" -cf "$B/api-dist.tar" dist
  say "  api-dist.tar    $(size "$B/api-dist.tar") bytes (the identified artifact travels with the bundle)"
  # THE DEPENDENCIES TRAVEL AS THEIR RECORD (R4). A restore whose build root is gone
  # used to run the bundled dist against the CHECKOUT's node_modules and merely report
  # a different lockfile. The bundle now carries the runtime workspace — the committed
  # lockfile, the workspace and package manifests, and the built workspace package the
  # API imports — so restore.sh can `pnpm install --frozen-lockfile --prod` from the
  # bundle's own record and refuse to launch when that install cannot be bound.
  BUILD_SRC="$(jq -r '.build.source_root' <<<"$BUILD_IDENTITY")"
  RT_FILES="pnpm-lock.yaml pnpm-workspace.yaml package.json apps/api/package.json packages/contracts/package.json packages/contracts/dist"
  [[ ! -f "$BUILD_SRC/.npmrc" ]] || RT_FILES="$RT_FILES .npmrc"
  for f in apps/web/package.json packages/tokens/package.json; do [[ ! -f "$BUILD_SRC/$f" ]] || RT_FILES="$RT_FILES $f"; done
  # shellcheck disable=SC2086
  tar -C "$BUILD_SRC" -cf "$B/runtime-workspace.tar" $RT_FILES
  say "  runtime-workspace.tar $(size "$B/runtime-workspace.tar") bytes (lockfile sha256 $(jq -r '.lockfile.sha256' <<<"$BUILD_IDENTITY"), workspace manifests, packages/contracts/dist)"
  if [[ "${EYE_BACKUP_PRUNE_BUILD:-0}" == "1" ]]; then
    rm -rf "$BUILD_ROOT/src"
    say "  EYE_BACKUP_PRUNE_BUILD=1: the checkout and its node_modules are removed; $BUILD_ROOT keeps only BUILD_IDENTITY.json and DIST_ENTRIES.json"
  fi
fi

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

# ------------------------------------------------------ capture boundary (§4)
# The three artefacts (dumps, vault tar, journal tar) are separate moments. This is
# the boundary the bundle claims, recorded on BOTH sides of the window:
#
#   per database  the current snapshot's xmin/xmax (a PURE READ: pg_current_xact_id()
#                 would assign a transaction id and therefore WRITE), the audit head
#                 per partition, the newest blob manifest and the counts;
#   for the vault a listing digest over sorted "<size> <path>" lines.
#
# Restore RECONCILES against it: anything admitted after the boundary is enumerated
# and either has its bytes in the bundle or is reported as falling outside.
db_boundary() { # db_boundary <db> -> one JSON object
  psq "$1" "select json_build_object(
    'at',                      now(),
    'snapshot_xmin',           pg_snapshot_xmin(pg_current_snapshot())::text,
    'snapshot_xmax',           pg_snapshot_xmax(pg_current_snapshot())::text,
    'audit_head_seq',          (select coalesce(json_object_agg(partition_id, next_seq), '{}'::json) from audit.audit_chain_heads),
    'audit_events',            (select count(*) from audit.audit_events),
    'blob_manifests',          (select count(*) from observation.blob_manifests),
    'blob_manifest_max_created_at', (select max(created_at) from observation.blob_manifests),
    'scheduled_attempts',      (select count(*) from observation.scheduled_attempts),
    'scheduler_entries',       (select count(*) from observation.scheduler_entries)
  )::text"
}
vault_boundary() { # vault_boundary -> one JSON object (listing digest; contents are not re-hashed here)
  local root="$SOURCE_ROOT/$VAULT_REL" n b d
  n=$(find "$root" -type f | wc -l | tr -d ' ')
  b=$(find "$root" -type f -exec wc -c {} + 2>/dev/null | awk '$NF != "total" { s += $1 } END { print s + 0 }')
  d=$(find "$root" -type f -exec wc -c {} + 2>/dev/null | awk '$NF != "total" { print $1, $2 }' | LC_ALL=C sort | ops_sha256 /dev/stdin)
  jq -cn --argjson n "$n" --argjson b "${b:-0}" --arg d "$d" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{at:$at, files:$n, payload_bytes:$b, listing_digest:$d}'
}
capture_boundary() { # capture_boundary <label> -> one JSON object over every database plus the vault
  local label="$1" out="{}" db
  for db in $DATABASES; do out="$(jq -c --arg db "$db" --argjson f "$(db_boundary "$db")" '. + {($db): $f}' <<<"$out")"; done
  jq -cn --arg l "$label" --argjson dbs "$out" --argjson v "$(vault_boundary)" '{label:$l, databases:$dbs, vault:$v}'
}

step "capture boundary (before the dumps): snapshot ids, audit heads, newest blob manifest, vault listing digest"
BOUNDARY_BEFORE="$(capture_boundary "before the dumps")"
for db in $DATABASES; do
  say "  $db: xmin=$(jq -r --arg d "$db" '.databases[$d].snapshot_xmin' <<<"$BOUNDARY_BEFORE") xmax=$(jq -r --arg d "$db" '.databases[$d].snapshot_xmax' <<<"$BOUNDARY_BEFORE") audit_events=$(jq -r --arg d "$db" '.databases[$d].audit_events' <<<"$BOUNDARY_BEFORE") manifests=$(jq -r --arg d "$db" '.databases[$d].blob_manifests' <<<"$BOUNDARY_BEFORE") newest_manifest=$(jq -r --arg d "$db" '.databases[$d].blob_manifest_max_created_at' <<<"$BOUNDARY_BEFORE")"
done
say "  vault: files=$(jq -r '.vault.files' <<<"$BOUNDARY_BEFORE") bytes=$(jq -r '.vault.payload_bytes' <<<"$BOUNDARY_BEFORE") listing_digest=$(jq -r '.vault.listing_digest' <<<"$BOUNDARY_BEFORE" | cut -c1-16)…"
if [[ -n "${EYE_BACKUP_QUIESCE_NOTE:-}" ]]; then
  say "  QUIESCED for this window: ${EYE_BACKUP_QUIESCE_NOTE}"
else
  say "  NOT quiesced: the source keeps admitting while the window is open; restore reconciles against this boundary"
fi

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
step "vault.tar ($VAULT_REL, paths relative to the source root $SOURCE_ROOT)"
[[ -d "$SOURCE_ROOT/$VAULT_REL/evidence" && -d "$SOURCE_ROOT/$VAULT_REL/quarantine" ]] || die "$SOURCE_ROOT/$VAULT_REL is missing one of its two roots"
tar -C "$SOURCE_ROOT" -cf "$B/vault.tar" "$VAULT_REL"
VAULT_FILES=$(find "$SOURCE_ROOT/$VAULT_REL" -type f | wc -l | tr -d ' ')
# summed per file: `wc -c` prints one "total" line PER BATCH once the file list exceeds one argv, so the
# last line alone under-reports (observed with 7,717 vault files on 2026-09-10)
VAULT_BYTES=$(find "$SOURCE_ROOT/$VAULT_REL" -type f -exec wc -c {} + 2>/dev/null | awk '$NF != "total" { s += $1 } END { print s + 0 }')
say "  vault.tar  $(size "$B/vault.tar") bytes  files=$VAULT_FILES payload_bytes=${VAULT_BYTES:-0}"

step "journal.tar (degraded-audit journals)"
JOURNAL_JSON="[]"
JOURNAL_PRESENT=""
for d in $JOURNAL_DIRS; do
  if [[ -d "$SOURCE_ROOT/$d" ]]; then
    n=$(find "$SOURCE_ROOT/$d" -type f | wc -l | tr -d ' ')
    JOURNAL_PRESENT="$JOURNAL_PRESENT $d"
    JOURNAL_JSON="$(jq -c --arg p "$d" --argjson n "$n" '. + [{path:$p, present:true, files:$n}]' <<<"$JOURNAL_JSON")"
    say "  $d: present, files=$n"
  else
    JOURNAL_JSON="$(jq -c --arg p "$d" '. + [{path:$p, present:false, files:0}]' <<<"$JOURNAL_JSON")"
    say "  $d: absent under $SOURCE_ROOT (this source has not journalled a degraded state there)"
  fi
done
if [[ -n "$JOURNAL_PRESENT" ]]; then
  # shellcheck disable=SC2086
  tar -C "$SOURCE_ROOT" -cf "$B/journal.tar" $JOURNAL_PRESENT
else
  tar -cf "$B/journal.tar" -T /dev/null
fi
say "  journal.tar  $(size "$B/journal.tar") bytes"

step "config/env (byte copy, 0600 — never displayed)"
cp "$ENV_FILE" "$B/config/env"
chmod 600 "$B/config/env"
cmp -s "$ENV_FILE" "$B/config/env" || die "config/env copy does not match the source"
say "  config/env  $(size "$B/config/env") bytes  keys=$(grep -c '^[A-Z0-9_]*=' "$B/config/env")"

step "capture boundary (after every artefact): the closing edge of the window"
BOUNDARY_AFTER="$(capture_boundary "after every artefact")"
BOUNDARY_STABLE=true
for db in $DATABASES; do
  # Stability is judged on what was ADMITTED, not on the snapshot markers: xmin/xmax
  # advance with every transaction anywhere in the cluster, including this script's
  # own reads, so comparing them would report movement that admitted nothing.
  bb="$(jq -c --arg d "$db" '.databases[$d] | del(.at, .snapshot_xmin, .snapshot_xmax)' <<<"$BOUNDARY_BEFORE")"
  ba="$(jq -c --arg d "$db" '.databases[$d] | del(.at, .snapshot_xmin, .snapshot_xmax)' <<<"$BOUNDARY_AFTER")"
  if [[ "$bb" == "$ba" ]]; then say "  $db: the boundary did not move during the window"
  else BOUNDARY_STABLE=false; say "  $db: the boundary MOVED during the window (audit_events $(jq -r --arg d "$db" '.databases[$d].audit_events' <<<"$BOUNDARY_BEFORE") -> $(jq -r --arg d "$db" '.databases[$d].audit_events' <<<"$BOUNDARY_AFTER"), manifests $(jq -r --arg d "$db" '.databases[$d].blob_manifests' <<<"$BOUNDARY_BEFORE") -> $(jq -r --arg d "$db" '.databases[$d].blob_manifests' <<<"$BOUNDARY_AFTER")); restore reconciles what was admitted after it"; fi
done
if [[ "$(jq -c '.vault | del(.at)' <<<"$BOUNDARY_BEFORE")" == "$(jq -c '.vault | del(.at)' <<<"$BOUNDARY_AFTER")" ]]; then
  say "  vault: unchanged during the window ($(jq -r '.vault.files' <<<"$BOUNDARY_AFTER") files)"
else
  BOUNDARY_STABLE=false
  say "  vault: CHANGED during the window ($(jq -r '.vault.files' <<<"$BOUNDARY_BEFORE") -> $(jq -r '.vault.files' <<<"$BOUNDARY_AFTER") files)"
fi
if [[ "$BOUNDARY_STABLE" == "true" ]]; then
  say "  GUARANTEE: the window is coherent — nothing was admitted between the first and the last artefact${EYE_BACKUP_QUIESCE_NOTE:+ (quiesced: $EYE_BACKUP_QUIESCE_NOTE)}"
else
  say "  GUARANTEE: bounded reconciliation — the dumps are each internally consistent (one pg_dump snapshot per database) and everything admitted after the recorded boundary is enumerated by restore and reported"
fi

# ------------------------------------------------------------------ images
# The pin of each service is read from docker-compose.yml BY SERVICE IDENTITY
# (services.postgres.image, services.redis.image), whatever registry or path the
# reference carries; both pins are recorded so that restore can start its
# isolated container from the bundle's own recorded pin.
step "image pins and process protections (by compose service identity) and what the running containers carry"
# The declared protections (compose user / cap_drop / security_opt) are the
# deployment's configuration and are recorded next to the pin; the running
# container's HostConfig is recorded as observed so that a container that has not
# yet been recreated after a re-pin or a protection change is visible as such.
img_json() { # img_json <service> <container> <compose-service-json>
  local svc="$1" c="$2" sj="$3" id digests hc
  id="$(docker inspect --format '{{.Image}}' "$c")"
  digests="$(docker image inspect "$id" | jq -c '.[0].RepoDigests // []')"
  # the user is in Config.User (compose `user:` / docker run --user); cap_drop and security_opt in HostConfig
  hc="$(docker inspect "$c" | jq -c '.[0] | {user:(.Config.User // ""), cap_drop:(.HostConfig.CapDrop // []), security_opt:(.HostConfig.SecurityOpt // [])}')"
  jq -cn --arg svc "$svc" --arg c "$c" --arg id "$id" --argjson d "$digests" --argjson sj "$sj" --argjson hc "$hc" '
    ($sj.image // "") as $pin | ($pin | split("@") | .[1] // "") as $pindigest
    | {user:$sj.user, cap_drop:($sj.cap_drop // []), security_opt:($sj.security_opt // [])} as $declared
    | {service:$svc, container:$c, image_id:$id, repo_digests:$d, compose_pin:$pin,
       compose_pin_digest:$pindigest,
       pin_matches:($d|index($pin)!=null),
       pin_digest_matches:(($d|map(split("@")|.[1] // "")|index($pindigest))!=null),
       compose_protections:$declared,
       running_protections:$hc,
       running_protections_match:(($hc.user == ($declared.user // "")) and (($hc.cap_drop|sort) == ($declared.cap_drop|sort)) and (($hc.security_opt|sort) == ($declared.security_opt|sort)))}'
}
PG_SVC_JSON="$(jq -c --arg s "$PG_SERVICE" '.services[$s]' <<<"$COMPOSE_JSON")"
REDIS_SVC_JSON="$(jq -c --arg s "$REDIS_SERVICE" '.services[$s]' <<<"$COMPOSE_JSON")"
PG_IMG="$(img_json "$PG_SERVICE" "$PG_CONTAINER" "$PG_SVC_JSON")"
REDIS_IMG="$(img_json "$REDIS_SERVICE" "$REDIS_CONTAINER" "$REDIS_SVC_JSON")"
img_say() { # img_say <service> <img-json>
  say "  $1: pin $(jq -r '.compose_pin' <<<"$2")"
  say "    declared protections: user=$(jq -r '.compose_protections.user // "(none)"' <<<"$2") cap_drop=$(jq -c '.compose_protections.cap_drop' <<<"$2") security_opt=$(jq -c '.compose_protections.security_opt' <<<"$2")"
  say "    running: $(jq -r '.repo_digests|join(" ")' <<<"$2")  pin_matches=$(jq -r '.pin_matches' <<<"$2") pin_digest_matches=$(jq -r '.pin_digest_matches' <<<"$2")"
  say "    running protections: user=$(jq -r '.running_protections.user | if . == "" then "(none)" else . end' <<<"$2") cap_drop=$(jq -c '.running_protections.cap_drop' <<<"$2") security_opt=$(jq -c '.running_protections.security_opt' <<<"$2")  match_declared=$(jq -r '.running_protections_match' <<<"$2")"
  if [[ "$(jq -r '.pin_digest_matches' <<<"$2")" != "true" ]]; then
    say "    NOTE: the running container does not carry the pinned digest (it has not been recreated since the re-pin); the pin above is what a restore starts from"
  fi
}
img_say "$PG_SERVICE" "$PG_IMG"
img_say "$REDIS_SERVICE" "$REDIS_IMG"

# --------------------------------------------------------------- manifest
step "MANIFEST.json"
FILES_JSON="{}"
SEALED_FILES="pg/eye.dump,pg/eye_demo.dump,pg/globals.sql,vault.tar,journal.tar,config/env"
[[ ! -f "$B/api-dist.tar" ]] || SEALED_FILES="$SEALED_FILES,api-dist.tar"
[[ ! -f "$B/runtime-workspace.tar" ]] || SEALED_FILES="$SEALED_FILES,runtime-workspace.tar"
for f in ${SEALED_FILES//,/ }; do
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
  --arg fmt "$BUNDLE_FORMAT" --argjson build "$BUILD_IDENTITY" --argjson distrun "${DIST_MATCHES_RUNNING:-null}" \
  --argjson bb "$BOUNDARY_BEFORE" --argjson ba "$BOUNDARY_AFTER" --argjson stable "$BOUNDARY_STABLE" \
  --arg quiesce "${EYE_BACKUP_QUIESCE_NOTE:-}" --arg srcroot "$SOURCE_ROOT" --arg srclabel "$SOURCE_LABEL" \
  --argjson srclive "$SOURCE_IS_LIVE" --arg pgc "$PG_CONTAINER" --arg rdc "$REDIS_CONTAINER" \
  '{
    format: $fmt,
    bundle: {created_at_utc:$ts, host:$host, repository:$repo, git_head:$head, git_branch:$branch,
             backup_duration_seconds:$duration, bundle_size_kb:$kb, superuser_role:$su},
    source: {live:$srclive, label:$srclabel, root:$srcroot, postgres_container:$pgc, redis_container:$rdc},
    build: $build,
    build_matches_running_dist: $distrun,
    capture: {
      boundary_before: $bb,
      boundary_after: $ba,
      stable: $stable,
      quiesce: (if $quiesce == "" then null else $quiesce end),
      guarantee: (if $stable
        then "COHERENT WINDOW: the recorded boundary did not move between the first and the last artefact, so the dumps, the vault tar and the journal tar describe one state."
        else "BOUNDED RECONCILIATION: each dump is internally consistent (one pg_dump snapshot per database) and the boundary is recorded on both sides; restore enumerates everything admitted after boundary_before and reports what falls outside the bundle." end)
    },
    databases: ($dbs|split(" ")),
    files: $files,
    database_facts: {before_dump:$before, after_dump:$after, changed_during_dump_window:$drift},
    compose: {file:"docker-compose.yml", sha256:$csha, unmodified_in_worktree:$cclean,
              services:{($pgsvc):({image:$pg.compose_pin} + $pg.compose_protections),
                        ($rsvc):({image:$redis.compose_pin} + $redis.compose_protections)}},
    images: {postgres:$pg, redis:$redis},
    vault: {root:$vault, files:$vfiles, payload_bytes:$vbytes},
    journal: $journal,
    redis: {backed_up:false,
            reason:"BullMQ schedulers are reconciled from observation.scheduler_entries / executive.briefings_to_reconcile() at API bootstrap (collection-worker.service.ts, agent-worker.service.ts); the domain-events outbox is durable in the database (outbox.publisher.ts). Redis holds no state that cannot be rebuilt."}
  }' > "$B/MANIFEST.json"
chmod 600 "$B/MANIFEST.json"

# ------------------------------------------------------------ encryption (§2)
# Every payload file is sealed and its plaintext removed. MANIFEST.json and RUN.json
# stay in the clear (no secret is in either) so a bundle can be identified, its
# passphrase checked and its integrity verified without decrypting anything.
step "sealing the bundle (AES-256-GCM; per-bundle key wrapped under EYE_BACKUP_PASSPHRASE)"
CRYPTO="$(node "$REPO/scripts/ops/bundle-crypto.mjs" seal --bundle "$B" --files "$SEALED_FILES")" \
  || die "the bundle could not be sealed; it is removed rather than left in the clear"
jq --argjson c "$CRYPTO" '. + {encryption:$c}' "$B/MANIFEST.json" > "$B/MANIFEST.json.tmp" && chmod 600 "$B/MANIFEST.json.tmp" && mv "$B/MANIFEST.json.tmp" "$B/MANIFEST.json"
say "  cipher: $(jq -r .cipher <<<"$CRYPTO"); key derivation: $(jq -r '.kdf.algorithm + " x" + (.kdf.iterations|tostring)' <<<"$CRYPTO"); the key itself is nowhere on disk"
jq -r '.files | to_entries[] | "  sealed \(.key)\(.value.plaintext_bytes|tostring|" (" + . + " bytes plaintext)")"' <<<"$CRYPTO"
# The passphrase must not verify by accident: prove the sealed bundle opens.
node "$REPO/scripts/ops/bundle-crypto.mjs" verify --bundle "$B" >/dev/null \
  || die "the sealed bundle does not verify with the passphrase it was sealed under"
say "  verified: every sealed file authenticates and decrypts to its recorded plaintext sha256"
BUNDLE_KB=$(du -sk "$B" | awk '{print $1}')

say ""
say "bundle complete: $B  ($BUNDLE_KB KB, $(( T1 - T0 ))s)"
say "  source: $SOURCE_LABEL"
jq -r '.files | to_entries[] | "  \(.key)  plaintext sha256=\(.value.sha256)  bytes=\(.value.bytes)  (stored as \(.key).enc)"' "$B/MANIFEST.json"
say "  MANIFEST.json  sha256=$(sha "$B/MANIFEST.json")  (in the clear: it holds no secret)"
say "  RUN.json  created: $(jq -r '[.created[] | .kind] | join(",")' "$B/RUN.json")"
[[ "$BUILD_IDENTITY" == "null" ]] || say "  build: $(jq -r '.git.sha' <<<"$BUILD_IDENTITY" | cut -c1-12) -> $(jq -r '.dist.digest' <<<"$BUILD_IDENTITY")"
say ""
say "TO RESTORE THIS BUNDLE YOU NEED: the bundle directory AND the passphrase it was sealed with."
say "Neither is derivable from the other. If the passphrase is lost the bundle cannot be opened by anyone."
