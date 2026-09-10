#!/usr/bin/env bash
# The Eye — proof of the destination guards (delivery package R0/P7-D).
#
# Executes the SAME guard functions backup.sh and restore.sh use
# (scripts/ops/lib/guards.sh) and the same compose parser
# (scripts/ops/compose-services.mjs) against DISPOSABLE stand-in directories
# created under mktemp. The real repository, .eye-local, the live containers and
# the live volumes are never a destination and never touched; the two end-to-end
# probes invoke the real scripts with stand-in destinations that the guards
# refuse before any read of the credential file, any write, or any docker call
# that creates something.
#
# Prints PASS/FAIL per probe and exits non-zero if any probe fails.
set -uo pipefail
umask 077

HERE="$(cd -P "$(dirname "$0")" && pwd -P)"
REPO="$(cd -P "$HERE/../.." && pwd -P)"
# shellcheck source=lib/guards.sh
. "$HERE/lib/guards.sh"

PASS=0; FAIL=0
probe() { # probe <name> <expect: accepted|refused|created|ok> <verdict-line> [expected-substring]
  local name="$1" expect="$2" verdict="$3" want="${4:-}"
  local got="${verdict%%:*}"
  if [[ "$got" == "$expect" && ( -z "$want" || "$verdict" == *"$want"* ) ]]; then
    PASS=$((PASS+1)); printf 'PASS  %s\n      %s\n' "$name" "$verdict"
  else
    FAIL=$((FAIL+1)); printf 'FAIL  %s (expected %s%s)\n      %s\n' "$name" "$expect" "${want:+ containing \"$want\"}" "$verdict"
  fi
}

T="$(mktemp -d "${TMPDIR:-/tmp}/eye-guard-probes.XXXXXX")"
T="$(cd -P "$T" && pwd -P)"
trap 'rm -rf "$T"' EXIT
printf 'stand-in root: %s\n' "$T"
printf 'host: %s, bash %s\n' "$(uname -s) $(uname -r)" "$BASH_VERSION"

# ------------------------------------------------ the stand-in repository
# Shaped like the real one: a git worktree with .eye-local, apps/api/.eye-local,
# and a docker-compose.yml whose services are pinned to GHCR references and
# which declares one bind-mount host path (the real compose has none).
SR="$T/repo"
mkdir -p "$SR/.eye-local/vault" "$SR/apps/api/.eye-local" "$SR/existing-subdir" "$T/bind-host"
git -C "$SR" init -q
PG_GHCR="ghcr.io/a-halawany/elven/postgres@sha256:$(printf '1%.0s' $(seq 1 64))"
REDIS_GHCR="ghcr.io/a-halawany/elven/redis@sha256:$(printf '2%.0s' $(seq 1 64))"
cat > "$SR/docker-compose.yml" <<EOF
services:
  postgres:
    image: $PG_GHCR # postgres:18-alpine-maint
    container_name: eye-postgres
    user: "70:70"
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    volumes:
      - eye-pgdata:/var/lib/postgresql
      - $T/bind-host:/mnt/bind
  redis:
    image: $REDIS_GHCR # redis:8-alpine-maint
    container_name: eye-redis
    user: "999:1000"
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
volumes:
  eye-pgdata:
EOF
# the 2026-09-09 incident shape: .eye-local replaced by a symlink pointing outside the repository
mkdir -p "$T/eye-local-real"
SR2="$T/repo-with-symlinked-eye-local"
mkdir -p "$SR2/apps/api/.eye-local"; ln -s "$T/eye-local-real" "$SR2/.eye-local"

PROTECTED="$(ops_protected_paths "$SR")"
printf '\nprotected set of the stand-in repository (physical):\n'; printf '%s\n' "$PROTECTED" | sed 's/^/  /'
# shellcheck disable=SC2086
set -- $PROTECTED

printf '\n== probes: containment and symlinks (library functions, stand-in paths only)\n'
# 1. an OUTSIDE symlink pointing into the repository (the reviewer's probe)
ln -s "$SR/existing-subdir" "$T/outside-link"
probe "outside symlink into the stand-in repository is refused" refused \
  "$(ops_guard_destination "restore root" "$T/outside-link" "$@")" "protected path $SR"
probe "a fresh path beneath that outside symlink is refused" refused \
  "$(ops_guard_destination "restore root" "$T/outside-link/new-root" "$@")" "protected path $SR"
ln -s "$SR/not-yet-created" "$T/dangling-link-into-repo"
probe "a dangling outside symlink whose target would be inside the repository is refused" refused \
  "$(ops_guard_destination "restore root" "$T/dangling-link-into-repo/new-root" "$@")" "protected path $SR"

# 2. backup root EQUAL to the repository (the reviewer's probe)
probe "backup root equal to the stand-in repository is refused" refused \
  "$(ops_guard_destination "EYE_BACKUP_ROOT" "$SR" "$@")" "equal to"
probe "backup root inside the stand-in repository is refused" refused \
  "$(ops_guard_destination "EYE_BACKUP_ROOT" "$SR/existing-subdir" "$@")" "protected path $SR"
probe "backup root that is an ANCESTOR of the stand-in repository is refused" refused \
  "$(ops_guard_destination "EYE_BACKUP_ROOT" "$T" "$@")" "protected path $SR"
probe "backup root equal to the stand-in .eye-local is refused" refused \
  "$(ops_guard_destination "EYE_BACKUP_ROOT" "$SR/.eye-local" "$@")" ".eye-local"
probe "destination inside the compose bind-mount host path is refused" refused \
  "$(ops_guard_destination "restore root" "$T/bind-host/sub" "$@")" "bind-host"

# 3. a destination that already exists
mkdir -p "$T/exists-already"
probe "a destination that already exists is refused (fresh mkdir required)" refused \
  "$(ops_mkdir_fresh "restore root" "$T/exists-already")" "already exists"
: > "$T/exists-as-file"
probe "a destination that exists as a file is refused" refused \
  "$(ops_mkdir_fresh "restore root" "$T/exists-as-file")" "already exists"
ln -s "$T/never" "$T/dangling"
probe "a destination that exists as a dangling symlink is refused" refused \
  "$(ops_mkdir_fresh "restore root" "$T/dangling")" "already exists"

# 4. a nested symlinked ancestor (physically outside every protected path, yet refused)
mkdir -p "$T/real-outside" "$T/a"; ln -s "$T/real-outside" "$T/a/link"
probe "a nested symlinked ancestor of a fresh destination is refused" refused \
  "$(ops_guard_destination "restore root" "$T/a/link/new/root" "$@")" "$T/a/link is a symlink"
probe "a symlinked backup root is refused as a root" refused \
  "$(ops_require_existing_dir "EYE_BACKUP_ROOT" "$T/a/link")" "is a symlink"
probe "a missing backup root is refused (it must already exist)" refused \
  "$(ops_require_existing_dir "EYE_BACKUP_ROOT" "$T/missing-root")" "does not exist"

# 5. a legitimate fresh destination
mkdir -p "$T/fresh"
probe "a legitimate fresh destination outside every protected path is accepted" accepted \
  "$(ops_guard_destination "restore root" "$T/fresh/root" "$@")" "physical $T/fresh/root"
probe "…and is created with a plain mkdir" created "$(ops_mkdir_fresh "restore root" "$T/fresh/root")"
probe "…and a second run against the same path is refused" refused "$(ops_mkdir_fresh "restore root" "$T/fresh/root")" "already exists"
probe "…the backup root form: an existing, non-symlink directory is accepted as a root" ok \
  "$(ops_require_existing_dir "EYE_BACKUP_ROOT" "$T/fresh")"

# 6. the symlinked-.eye-local incident shape: the symlink's TARGET is protected
PROT2="$(ops_protected_paths "$SR2")"
# shellcheck disable=SC2086
probe "with a symlinked .eye-local, a destination inside its target is refused" refused \
  "$(ops_guard_destination "restore root" "$T/eye-local-real/new" $PROT2)" "eye-local-real"

printf '\n== probes: image lookup by compose service identity (GHCR-pinned stand-in compose file)\n'
CJ="$(node "$HERE/compose-services.mjs" "$SR/docker-compose.yml")"
GOT_PG="$(jq -r '.services.postgres.image' <<<"$CJ")"; GOT_REDIS="$(jq -r '.services.redis.image' <<<"$CJ")"
probe "services.postgres.image is the GHCR reference" ok "$([[ "$GOT_PG" == "$PG_GHCR" ]] && echo "ok: $GOT_PG" || echo "bad: $GOT_PG")"
probe "services.redis.image is the GHCR reference" ok "$([[ "$GOT_REDIS" == "$REDIS_GHCR" ]] && echo "ok: $GOT_REDIS" || echo "bad: $GOT_REDIS")"
probe "container_name is read by service" ok "$([[ "$(jq -r '.services.postgres.container_name' <<<"$CJ")" == "eye-postgres" ]] && echo "ok: eye-postgres" || echo "bad")"
probe "the bind-mount host path is discovered from the service's volumes" ok \
  "$([[ "$(jq -r '.bind_mounts[0]' <<<"$CJ")" == "$T/bind-host" ]] && echo "ok: $T/bind-host" || echo "bad: $(jq -c .bind_mounts <<<"$CJ")")"
probe "the old textual predicate would NOT have matched the GHCR pin (the reviewer's finding, reproduced)" ok \
  "$(grep -qE '^[[:space:]]*image:[[:space:]]*postgres@' "$SR/docker-compose.yml" && echo "bad: matched" || echo "ok: no match for 'image: postgres@'; the service parse returns $GOT_PG")"
probe "the process protections are read by service (postgres: user, cap_drop as a flow list, security_opt)" ok \
  "$([[ "$(jq -c '.services.postgres | [.user, .cap_drop, .security_opt]' <<<"$CJ")" == '["70:70",["ALL"],["no-new-privileges:true"]]' ]] && echo "ok: $(jq -c '.services.postgres | {user, cap_drop, security_opt}' <<<"$CJ")" || echo "bad: $(jq -c '.services.postgres' <<<"$CJ")")"
probe "the process protections are read by service (redis: block lists)" ok \
  "$([[ "$(jq -c '.services.redis | [.user, .cap_drop, .security_opt]' <<<"$CJ")" == '["999:1000",["ALL"],["no-new-privileges:true"]]' ]] && echo "ok: $(jq -c '.services.redis | {user, cap_drop, security_opt}' <<<"$CJ")" || echo "bad: $(jq -c '.services.redis' <<<"$CJ")")"
CJ_STDIN="$(node "$HERE/compose-services.mjs" - "$SR" < "$SR/docker-compose.yml")"
probe "the parser reads a compose file from stdin (how restore reads the source revision's file)" ok \
  "$([[ "$(jq -r '.services.postgres.image' <<<"$CJ_STDIN")" == "$PG_GHCR" ]] && echo "ok: same reference from stdin" || echo "bad")"
CJ_REAL="$(node "$HERE/compose-services.mjs" "$REPO/docker-compose.yml")"
probe "the real docker-compose.yml is read by service identity (read-only)" ok \
  "$([[ "$(jq -r '.services.postgres.image' <<<"$CJ_REAL")" == *@sha256:* && "$(jq -r '.services.redis.image' <<<"$CJ_REAL")" == *@sha256:* ]] && echo "ok: postgres=$(jq -r '.services.postgres.image' <<<"$CJ_REAL" | cut -c1-40)… redis=$(jq -r '.services.redis.image' <<<"$CJ_REAL" | cut -c1-37)…" || echo "bad")"
probe "the real docker-compose.yml declares process protections for both services (read-only; what restore applies to its isolated containers)" ok \
  "$([[ -n "$(jq -r '.services.postgres.user // empty' <<<"$CJ_REAL")" && -n "$(jq -r '.services.redis.user // empty' <<<"$CJ_REAL")" && "$(jq -r '.services.postgres.cap_drop | index("ALL") != null' <<<"$CJ_REAL")" == "true" && "$(jq -r '.services.redis.security_opt | index("no-new-privileges:true") != null' <<<"$CJ_REAL")" == "true" ]] && echo "ok: postgres user=$(jq -r '.services.postgres.user' <<<"$CJ_REAL") redis user=$(jq -r '.services.redis.user' <<<"$CJ_REAL"), cap_drop ALL and no-new-privileges:true on both" || echo "bad: $(jq -c '.services | map_values({user, cap_drop, security_opt})' <<<"$CJ_REAL")")"

printf '\n== probes: end to end — the real scripts refuse stand-in destinations before touching anything\n'
# backup.sh with EYE_BACKUP_ROOT set to a symlink (stand-in link -> stand-in dir): refused before .eye-local/env is read
BEFORE="$(docker ps -aq 2>/dev/null | sort | cksum | awk '{print $1}')"
OUT="$(EYE_BACKUP_ROOT="$T/a/link" "$HERE/backup.sh" 2>&1)"; RC=$?
probe "backup.sh refuses a symlinked EYE_BACKUP_ROOT (rc=$RC)" refused "$(grep -m1 '^backup: refused' <<<"$OUT" | sed 's/^backup: //')" "is a symlink"
probe "backup.sh refuses an EYE_BACKUP_ROOT that does not exist" refused \
  "$(EYE_BACKUP_ROOT="$T/no-such-root" "$HERE/backup.sh" 2>&1 | grep -m1 '^backup: refused' | sed 's/^backup: //')" "does not exist"
probe "backup.sh created nothing under the stand-in" ok "$([[ -z "$(ls -A "$T/real-outside")" ]] && echo "ok: $T/real-outside is empty" || echo "bad")"
# restore.sh with a stand-in bundle (valid, empty manifest) and an EYE_RESTORE_ROOT that already exists
mkdir -p "$T/standin-bundle" "$T/restore-exists"
jq -n '{format:"eye-backup-bundle/1", bundle:{created_at_utc:"standin", git_head:"0000000000000000000000000000000000000000"}, files:{}}' > "$T/standin-bundle/MANIFEST.json"
OUT="$(EYE_RESTORE_ROOT="$T/restore-exists" "$HERE/restore.sh" "$T/standin-bundle" --into-isolated 2>&1)"; RC=$?
probe "restore.sh refuses an EYE_RESTORE_ROOT that already exists (rc=$RC)" refused "$(grep -m1 '^restore: refused' <<<"$OUT" | sed 's/^restore: //')" "already exists"
probe "restore.sh refuses an EYE_RESTORE_ROOT beneath an outside symlink into the stand-in repository" refused \
  "$(EYE_RESTORE_ROOT="$T/outside-link/root" "$HERE/restore.sh" "$T/standin-bundle" --into-isolated 2>&1 | grep -m1 '^restore: refused' | sed 's/^restore: //')" "symlink"
probe "restore.sh refuses an EYE_RESTORE_ROOT inside the bundle being restored" refused \
  "$(EYE_RESTORE_ROOT="$T/standin-bundle/root" "$HERE/restore.sh" "$T/standin-bundle" --into-isolated 2>&1 | grep -m1 '^restore: refused' | sed 's/^restore: //')" "standin-bundle"
probe "restore.sh refuses an EYE_RESTORE_ROOT whose parent is a symlink" refused \
  "$(EYE_RESTORE_ROOT="$T/a/link/root" "$HERE/restore.sh" "$T/standin-bundle" --into-isolated 2>&1 | grep -m1 '^restore: refused' | sed 's/^restore: //')" "is a symlink"
AFTER="$(docker ps -aq 2>/dev/null | sort | cksum | awk '{print $1}')"
probe "no container was created or removed by the end-to-end probes" ok "$([[ "$BEFORE" == "$AFTER" ]] && echo "ok: docker ps -aq unchanged ($AFTER)" || echo "bad: $BEFORE -> $AFTER")"
probe "no eye-restore-* container or volume exists after the probes" ok \
  "$([[ -z "$(docker ps -a --format '{{.Names}}' | grep '^eye-restore-')$(docker volume ls --format '{{.Name}}' | grep '^eye-restore-')" ]] && echo "ok: none" || echo "bad")"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
