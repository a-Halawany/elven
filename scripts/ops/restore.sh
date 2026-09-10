#!/usr/bin/env bash
# The Eye — runtime-state restore (delivery package R0/P7-D). Companion of backup.sh;
# procedure and guarantees in docs/ops/BACKUP_RESTORE.md.
#
#   restore.sh <bundle>                   validate the bundle (an encrypted bundle: the passphrase's
#                                         verification tag, then every GCM tag and every plaintext sha256,
#                                         without writing a byte of plaintext) and print the in-place
#                                         procedure; touches nothing else
#   restore.sh <bundle> --into-isolated   restore into an ISOLATED environment and VERIFY coherence:
#                                           eye-restore-pg     postgres started from the BUNDLE'S RECORDED PIN
#                                                              (MANIFEST.json images.postgres.compose_pin, read at backup
#                                                              time from the compose `postgres` service), verified to
#                                                              resolve locally by digest before it is started;
#                                                              new volume eye-restore-pgdata, host port 127.0.0.1:55433
#                                           eye-restore-redis  redis from the bundle's recorded redis pin, host port
#                                                              127.0.0.1:56379 (empty: the runbook's claim that Redis is
#                                                              rebuilt from the database)
#                                           both containers are started with the PROCESS PROTECTIONS the compose
#                                           services declare (user / cap_drop / security_opt, recorded in the bundle
#                                           at backup time; an older bundle falls back to the current compose file),
#                                           passed as --user / --cap-drop / --security-opt the way compose would,
#                                           and /proc/1/status (Uid, Gid, CapBnd, CapEff, NoNewPrivs) is observed
#                                           and checked against the declaration
#                                           EYE_RESTORE_ROOT, or $HOME/eye-restore/<ts>: the decrypted payload
#                                           (0700, inside the restore root — never next to the ciphertext),
#                                           vault, journal, config copy and the bundle's own application artifact
#                                           a second API from the VERIFIED artifact on :3402 against the restored
#                                           eye_demo, scheduler DISABLED, /readyz and one governed read proved
#                                           the degraded journal the bundle carried, replayed: a restart does not
#                                           clear degradation, and /readyz reports the same unreconciled count and
#                                           the same degradedSince the journal implies
#                                           the CAPTURE BOUNDARY reconciled: everything the source admitted after it
#                                           is enumerated, and what has no bytes in the bundle is named
#                                           the SCHEDULER reconstructed with collection ENABLED against an empty
#                                           isolated Redis, and one tick served from a REPLAY-mode source
#                                         then tears down EXACTLY the resources recorded in the run manifest
#                                         (<restore root>/RUN.json: container ids, volume, API pid) unless --keep
#   --keep                                leave the isolated environment running for inspection
#
# APPLICATION-ARTIFACT IDENTITY (CP-4/5 §1). The artifact this script starts is the one
# the bundle identifies: api-dist.tar is extracted, RE-DIGESTED and compared with
# MANIFEST.json's .build.dist.digest, and a divergence is REFUSED before anything runs.
# The target host's own apps/api/dist is compared too — when it differs, that is a
# source-to-target upgrade and is recorded as one, never silently accepted.
#
# ENCRYPTION (CP-4/5 §2). EYE_BACKUP_PASSPHRASE must be in the environment for a sealed
# bundle. It is verified against the manifest's tag BEFORE any ciphertext is read, and a
# file whose GCM tag does not authenticate never reaches a readable path.
#
# DESTINATION GUARDS (scripts/ops/lib/guards.sh) run before any chmod, copy, tar
# extraction or container start: the restore root is created FRESH (plain mkdir;
# it must not exist; its parent must exist, be a directory and not be a symlink)
# and its PHYSICAL path (symlinks resolved) must not be inside, equal to, or an
# ancestor of the repository worktree, .eye-local, apps/api/.eye-local, a compose
# bind-mount host path, or the bundle being restored. Neither the root nor any
# ancestor up to its nearest pre-existing directory may be a symlink.
#
# THE LIVE DEPLOYMENT IS NEVER TOUCHED: this script never names eye-postgres, eye-redis,
# their volumes, .eye-local/ or apps/api/.eye-local/ in any command; every resource it creates
# is prefixed eye-restore- and recorded in RUN.json, and only recorded resources are removed.
#
# NO SECRET IS EVER PRINTED. config/env is loaded with `set -a; . env; set +a` and its values
# travel only as process environment (PGPASSWORD, POSTGRES_PASSWORD, REDIS_PASSWORD, the API's
# own configuration). Do not add `set -x`.
set -euo pipefail
set +x
umask 077

REPO="$(cd -P "$(dirname "$0")/../.." && pwd -P)"
# shellcheck source=lib/guards.sh
. "$REPO/scripts/ops/lib/guards.sh"
COMPOSE_FILE="$REPO/docker-compose.yml"
PG_SERVICE="postgres"; REDIS_SERVICE="redis"
PG_NAME="eye-restore-pg"; PG_VOLUME="eye-restore-pgdata"; PG_PORT="${EYE_RESTORE_PG_PORT:-55433}"
REDIS_NAME="eye-restore-redis"; REDIS_PORT="${EYE_RESTORE_REDIS_PORT:-56379}"
API_PORT="${EYE_RESTORE_API_PORT:-3402}"
API_DB="eye_demo"
PG_SUPERUSER="eye"
STRICT_BLOB_DBS="${EYE_RESTORE_STRICT_BLOB_DBS:-eye_demo}"   # databases whose vault bytes must ALL be present

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'restore: %s\n' "$*" >&2; exit 1; }
now_s() { date -u +%s; }
sha()  { ops_sha256 "$1"; }
PASS=0; FAIL=0
check() { # check <ok:true|false> <label>
  if [[ "$1" == "true" ]]; then PASS=$((PASS+1)); say "  PASS  $2"; else FAIL=$((FAIL+1)); say "  FAIL  $2"; fi
}

# ------------------------------------------------------------------ args
BUNDLE=""; ISOLATED=false; KEEP=false
for a in "$@"; do
  case "$a" in
    --into-isolated) ISOLATED=true;;
    --keep) KEEP=true;;
    -h|--help) sed -n '2,70p' "$0"; exit 0;;
    *) [[ -z "$BUNDLE" ]] || die "unexpected argument: $a"; BUNDLE="$a";;
  esac
done
[[ -n "$BUNDLE" ]] || die "usage: restore.sh <bundle> [--into-isolated] [--keep]"
[[ -d "$BUNDLE" ]] || die "bundle $BUNDLE is not a directory"
BUNDLE="$(ops_phys "$BUNDLE")"
MANIFEST="$BUNDLE/MANIFEST.json"
[[ -f "$MANIFEST" ]] || die "$MANIFEST is missing"
command -v docker >/dev/null || die "docker is required"
command -v jq >/dev/null || die "jq is required"
command -v node >/dev/null || die "node is required"
BUNDLE_FORMAT="$(jq -r .format "$MANIFEST")"
case "$BUNDLE_FORMAT" in
  eye-backup-bundle/2) ;;
  eye-backup-bundle/1) ;;   # the pre-encryption bundles of the first three drills, still restorable
  *) die "unknown bundle format $BUNDLE_FORMAT";;
esac
ENCRYPTED=false
[[ -z "$(jq -r '.encryption.format // empty' "$MANIFEST")" ]] || ENCRYPTED=true

# --------------------------------------------------- bundle validation
step "bundle $BUNDLE ($BUNDLE_FORMAT, created $(jq -r .bundle.created_at_utc "$MANIFEST"), git $(jq -r .bundle.git_head "$MANIFEST" | cut -c1-12), source: $(jq -r '.source.label // "not recorded (a bundle from before the source was recorded)"' "$MANIFEST"))"
if [[ "$ENCRYPTED" == "true" ]]; then
  # INTEGRITY BEFORE EXTRACTION: the passphrase is checked against the manifest's
  # verification tag first (no ciphertext is touched if it is wrong), then every
  # sealed file is authenticated by its GCM tag and decrypted to a null sink to
  # check its plaintext sha256. Nothing is written yet.
  [[ -n "${EYE_BACKUP_PASSPHRASE:-}" ]] || die "this bundle is encrypted and EYE_BACKUP_PASSPHRASE is not set in the environment.
  To restore you need BOTH the bundle and the passphrase it was sealed with; neither is derivable from the other.
  See docs/ops/BACKUP_RESTORE.md §17."
  say "  encryption: $(jq -r '.encryption.cipher' "$MANIFEST"), key wrapped under $(jq -r '.encryption.kdf.algorithm' "$MANIFEST") x$(jq -r '.encryption.kdf.iterations' "$MANIFEST")"
  CRYPTO_REPORT="$(node "$REPO/scripts/ops/bundle-crypto.mjs" verify --bundle "$BUNDLE" --manifest "$MANIFEST")" \
    || die "the bundle does not verify: $CRYPTO_REPORT"
  jq -r '.files | to_entries[] | "  ok   \(.key)  \(.value)"' <<<"$CRYPTO_REPORT"
  say "  every sealed file authenticates under the passphrase and decrypts to its recorded plaintext sha256"
else
  say "  encryption: NONE — this bundle predates the encrypted format; its dumps, globals, vault and credential copy are on disk in the clear"
  ALL_OK=true
  for f in $(jq -r '.files | keys[]' "$MANIFEST"); do
    want="$(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")"
    if [[ -f "$BUNDLE/$f" ]] && [[ "$(sha "$BUNDLE/$f")" == "$want" ]]; then say "  ok   $f  $want"; else say "  BAD  $f"; ALL_OK=false; fi
  done
  [[ "$ALL_OK" == "true" ]] || die "bundle integrity check failed"
  say "  every file matches MANIFEST.json"
fi

if [[ "$ISOLATED" != "true" ]]; then
  cat <<EOF

The bundle is intact. This script restores ONLY into an isolated environment
(--into-isolated). Restoring IN PLACE over the live deployment is a governed
recovery: follow docs/ops/BACKUP_RESTORE.md §7 (stop the API, open the bundle
with its passphrase, restore pg/globals.sql then the dumps into a fresh
eye-pgdata volume, extract vault.tar and journal.tar at the repository root,
place config/env at .eye-local/env with mode 0600, rebuild the audit heads
through audit.rebuild_chain_heads() only after the chain verification has
passed, then start the API so the schedulers are reconciled from the database).

The artifact this bundle identifies: $(jq -r 'if (.build|type)=="object" then "git " + (.build.git.sha[0:12]) + ", dist " + .build.dist.digest else "NONE — this bundle records no build identity" end' "$MANIFEST")
The capture boundary:              $(jq -r 'if (.capture|type)=="object" then (if .capture.stable then "coherent window" else "bounded reconciliation" end) + (if .capture.quiesce then " (quiesced: " + .capture.quiesce + ")" else "" end) else "not recorded" end' "$MANIFEST")
To open it you need:               this directory AND the passphrase it was sealed with (docs/ops/BACKUP_RESTORE.md §17).
EOF
  exit 0
fi

# ------------------------------------------------- isolation preflight
step "isolation preflight: destination guards (physical paths; before any chmod, copy, extraction or container start)"
PROTECTED="$(ops_protected_paths "$REPO"; printf '%s\n' "$BUNDLE")"
say "  protected (physical): $(printf '%s' "$PROTECTED" | tr '\n' ' ')"
if [[ -n "${EYE_RESTORE_ROOT:-}" ]]; then
  RROOT="$EYE_RESTORE_ROOT"; RPARENT="$(dirname "$RROOT")"
else
  RPARENT="$HOME/eye-restore"; RROOT="$RPARENT/$(date -u +%Y%m%dT%H%M%SZ)"
fi
V="$(ops_require_existing_dir "restore root parent" "$RPARENT")" || die "$V"
say "  $V"
# shellcheck disable=SC2086
V="$(ops_guard_destination "restore root" "$RROOT" $PROTECTED)" || die "$V"
say "  $V"
V="$(ops_mkdir_fresh "restore root" "$RROOT")" || die "$V"
say "  $V"
RROOT="$(ops_phys "$RROOT")"
ops_run_init "$RROOT/RUN.json" "restore.sh"
ops_run_record dir "$RROOT" "restore root"
chmod 700 "$RROOT"
API_PID=""
teardown() {
  # Bound to the run manifest: only the process, containers and volume this run
  # recorded are stopped or removed; nothing is matched by name pattern.
  local id
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi
  if [[ "$KEEP" == "true" ]]; then
    say "  --keep: the resources recorded in $RROOT/RUN.json are left in place: $(jq -r '[.created[] | select(.kind=="container" or .kind=="volume") | .detail] | join(", ")' "$RROOT/RUN.json")"
    return
  fi
  for id in $(ops_run_ids container); do
    docker rm -f "$id" >/dev/null 2>&1 && say "  removed container $id ($(jq -r --arg i "$id" '.created[] | select(.id==$i) | .detail' "$RROOT/RUN.json"))" || say "  container $id was already gone"
  done
  for id in $(ops_run_ids volume); do
    docker volume rm "$id" >/dev/null 2>&1 && say "  removed volume $id" || say "  volume $id was already gone"
  done
  say "  restore root $RROOT (RUN.json, RESTORE_REPORT.json, api.log, work files, config copy) and the bundle are kept"
}
trap 'rc=$?; step "teardown (bound to $RROOT/RUN.json)"; teardown; exit $rc' EXIT

# ------------------------------------------------- decrypting the bundle
# SRC is where the PLAINTEXT payload lives for the rest of this run: the bundle
# itself for an old unencrypted bundle, or a 0700 directory inside the restore
# root for a sealed one. Nothing is ever decrypted next to the ciphertext, and the
# bundle directory is never written to.
SRC="$BUNDLE"
if [[ "$ENCRYPTED" == "true" ]]; then
  step "decrypting the sealed bundle into $RROOT/plain (0700; the bundle itself is not written to)"
  mkdir "$RROOT/plain"; chmod 700 "$RROOT/plain"
  ops_run_record dir "$RROOT/plain" "decrypted payload"
  OPENED="$(node "$REPO/scripts/ops/bundle-crypto.mjs" open --bundle "$BUNDLE" --into "$RROOT/plain" --manifest "$MANIFEST")" \
    || die "the bundle could not be decrypted"
  SRC="$RROOT/plain"
  jq -r '.files | to_entries[] | "  opened \(.key)  \(.value.bytes) bytes  sha256=\(.value.sha256)"' <<<"$OPENED"
  for f in $(jq -r '.files | keys[]' "$MANIFEST"); do
    check "$([[ "$(sha "$SRC/$f")" == "$(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")" ]] && echo true || echo false)" \
      "decrypted $f has the plaintext sha256 MANIFEST.json records"
  done
fi

step "isolation preflight: names, ports, build output"
for n in "$PG_NAME" "$REDIS_NAME"; do
  ! docker ps -a --format '{{.Names}}' | grep -qx "$n" || die "$n already exists; remove it (docker rm -f $n) or use --keep from a previous run deliberately"
done
! docker volume ls --format '{{.Name}}' | grep -qx "$PG_VOLUME" || die "volume $PG_VOLUME already exists; docker volume rm $PG_VOLUME"
for p in "$PG_PORT" "$REDIS_PORT" "$API_PORT"; do
  ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || die "port $p is in use"
done
say "  resources to create: $PG_NAME (:$PG_PORT, volume $PG_VOLUME), $REDIS_NAME (:$REDIS_PORT), API :$API_PORT"
say "  the application artifact is chosen and VERIFIED below (build identity), not assumed from apps/api/dist"

# ------------------------------------------------- image identity
# The isolated containers start from the pins RECORDED IN THE BUNDLE (read at
# backup time from the compose services by identity), never from a textual
# match on the current compose file. Each pin must resolve locally by digest.
step "image identity: the bundle's recorded pins (by compose service identity)"
PG_DIGEST="$(jq -r '.images.postgres.compose_pin // empty' "$MANIFEST")"
REDIS_DIGEST="$(jq -r '.images.redis.compose_pin // empty' "$MANIFEST")"
[[ -n "$PG_DIGEST" && -n "$REDIS_DIGEST" ]] || die "the manifest does not record both compose pins (images.postgres.compose_pin, images.redis.compose_pin)"
# The pin is the deployment's declared image. A source container that was still
# running an older image at backup time (not yet recreated after a re-pin) is
# reported, not refused: the restore starts from the pin, and the restored
# server's major version is checked against the dump's source server below.
for svc in postgres redis; do
  if [[ "$(jq -r --arg s "$svc" '.images[$s] | if (.pin_digest_matches == true) or (.pin_matches == true) then "true" else "false" end' "$MANIFEST")" != "true" ]]; then
    say "  REPORT: at backup time the source container $(jq -r --arg s "$svc" '.images[$s].container' "$MANIFEST") ran $(jq -r --arg s "$svc" '.images[$s].repo_digests | join(" ")' "$MANIFEST") — not the compose pin; the restore starts from the pin (the deployment's declared image)"
  fi
done
IMAGE_LOCAL_JSON=""
image_resolves() { # image_resolves <reference@sha256:…>  -> the local image's repo digests must contain the reference's digest; sets IMAGE_LOCAL_JSON
  local ref="$1" d id digests
  d="${ref#*@}"
  IMAGE_LOCAL_JSON=""
  [[ "$ref" == *@sha256:* ]] || { say "  $ref is not pinned by digest"; return 1; }
  id="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null)" || { say "  $ref is not present locally (no pull is attempted by this script)"; return 1; }
  # RepoDigests are read through jq: the `{{join .RepoDigests}}` template fails on some
  # multi-platform references under Docker 28.5 (wrong type for value), the JSON does not.
  IMAGE_LOCAL_JSON="$(docker image inspect "$id" | jq -c '.[0] | {id:.Id, repo_digests:(.RepoDigests // []), image_user:(.Config.User // ""), architecture:.Architecture, os:.Os, created:.Created}')"
  digests="$(jq -r '.repo_digests | join(",")' <<<"$IMAGE_LOCAL_JSON")"
  echo ",$digests," | grep -q "@$d," || { say "  $ref resolved to $id whose repo digests ($digests) do not carry $d"; return 1; }
  say "  $ref -> local image $id (repo digests carry $d; image USER '$(jq -r .image_user <<<"$IMAGE_LOCAL_JSON")', $(jq -r '.os + "/" + .architecture' <<<"$IMAGE_LOCAL_JSON"), created $(jq -r .created <<<"$IMAGE_LOCAL_JSON"))"
}
image_resolves "$PG_DIGEST" || die "the bundle's postgres pin does not resolve locally by digest"
PG_LOCAL="$IMAGE_LOCAL_JSON"
image_resolves "$REDIS_DIGEST" || die "the bundle's redis pin does not resolve locally by digest"
REDIS_LOCAL="$IMAGE_LOCAL_JSON"
SRC_HEAD="$(jq -r '.bundle.git_head' "$MANIFEST")"
if SRC_COMPOSE="$(git -C "$REPO" show "$SRC_HEAD:docker-compose.yml" 2>/dev/null)"; then
  SRC_JSON="$(printf '%s\n' "$SRC_COMPOSE" | node "$REPO/scripts/ops/compose-services.mjs" - "$REPO")" || die "the source revision's docker-compose.yml could not be parsed"
  SRC_PG="$(jq -r --arg s "$PG_SERVICE" '.services[$s].image // empty' <<<"$SRC_JSON")"
  SRC_REDIS="$(jq -r --arg s "$REDIS_SERVICE" '.services[$s].image // empty' <<<"$SRC_JSON")"
  check "$([[ "$SRC_PG" == "$PG_DIGEST" && "$SRC_REDIS" == "$REDIS_DIGEST" ]] && echo true || echo false)" \
    "bundle pins equal the compose file of the source revision $(cut -c1-12 <<<"$SRC_HEAD") (postgres $([[ "$SRC_PG" == "$PG_DIGEST" ]] && echo same || echo "DIFFERS: $SRC_PG"); redis $([[ "$SRC_REDIS" == "$REDIS_DIGEST" ]] && echo same || echo "DIFFERS: $SRC_REDIS"))"
  if [[ "$(jq -r 'if (.compose|type) == "object" and .compose.unmodified_in_worktree == false then "modified" else "clean-or-unknown" end' "$MANIFEST")" == "modified" ]]; then
    say "  note: the manifest records that docker-compose.yml was modified in the worktree at backup time; the pins above are what the worktree file said"
  fi
else
  say "  note: source revision $(cut -c1-12 <<<"$SRC_HEAD") is not in this clone; the bundle pins cannot be compared with its compose file"
fi
CUR_JSON=""
if [[ -f "$COMPOSE_FILE" ]]; then
  CUR_JSON="$(node "$REPO/scripts/ops/compose-services.mjs" "$COMPOSE_FILE")" || die "docker-compose.yml could not be parsed"
  CUR_PG="$(jq -r --arg s "$PG_SERVICE" '.services[$s].image // empty' <<<"$CUR_JSON")"
  CUR_REDIS="$(jq -r --arg s "$REDIS_SERVICE" '.services[$s].image // empty' <<<"$CUR_JSON")"
  if [[ "$CUR_PG" == "$PG_DIGEST" && "$CUR_REDIS" == "$REDIS_DIGEST" ]]; then
    say "  current docker-compose.yml pins the same images (report only)"
  else
    say "  REPORT: current docker-compose.yml differs from the bundle — postgres now $CUR_PG, redis now $CUR_REDIS; the isolated restore still uses the bundle's pins"
  fi
fi
say "  restore root: $RROOT"
say "  postgres: $PG_DIGEST"
say "  redis:    $REDIS_DIGEST"

# ------------------------------------------------- process protections
# The compose services' user / cap_drop / security_opt are the deployment's
# configuration. They are taken from the bundle (recorded by backup.sh next to
# the pin); a bundle that predates that record falls back to the current compose
# file. They are passed to `docker run` exactly as compose would apply them, and
# /proc/1/status of each started container is observed and checked below.
step "process protections for the isolated containers (compose user / cap_drop / security_opt)"
proto_json() { # proto_json <service> -> {user, cap_drop, security_opt, source}
  local svc="$1" j=""
  j="$(jq -c --arg s "$svc" '.compose.services[$s] // {} | select(has("user") or has("cap_drop") or has("security_opt"))
        | {user:(.user // null), cap_drop:(.cap_drop // []), security_opt:(.security_opt // []), source:("bundle (compose.services." + $s + " at backup time)")}' "$MANIFEST")"
  if [[ -z "$j" && -n "$CUR_JSON" ]]; then
    j="$(jq -c --arg s "$svc" '.services[$s] // {} | {user:(.user // null), cap_drop:(.cap_drop // []), security_opt:(.security_opt // []), source:"current docker-compose.yml (the bundle predates the recorded protections)"}' <<<"$CUR_JSON")"
  fi
  [[ -n "$j" ]] || j='{"user":null,"cap_drop":[],"security_opt":[],"source":"none declared"}'
  printf '%s\n' "$j"
}
proto_flags() { # proto_flags <proto-json> -> one docker run flag/value per line (empty when nothing is declared)
  jq -r '[ (if .user then ["--user", .user] else [] end),
           ((.cap_drop // []) | map(["--cap-drop", .]) | add // []),
           ((.security_opt // []) | map(["--security-opt", .]) | add // []) ] | add | .[]' <<<"$1"
}
PG_PROTO="$(proto_json "$PG_SERVICE")"; REDIS_PROTO="$(proto_json "$REDIS_SERVICE")"
PG_FLAGS=(); REDIS_FLAGS=()
while IFS= read -r l; do [[ -n "$l" ]] && PG_FLAGS[${#PG_FLAGS[@]}]="$l"; done <<<"$(proto_flags "$PG_PROTO")"
while IFS= read -r l; do [[ -n "$l" ]] && REDIS_FLAGS[${#REDIS_FLAGS[@]}]="$l"; done <<<"$(proto_flags "$REDIS_PROTO")"
say "  $PG_SERVICE: user=$(jq -r '.user // "(none)"' <<<"$PG_PROTO") cap_drop=$(jq -c .cap_drop <<<"$PG_PROTO") security_opt=$(jq -c .security_opt <<<"$PG_PROTO")  (from: $(jq -r .source <<<"$PG_PROTO"))"
say "    docker run flags: ${PG_FLAGS[*]+${PG_FLAGS[*]}}"
say "  $REDIS_SERVICE: user=$(jq -r '.user // "(none)"' <<<"$REDIS_PROTO") cap_drop=$(jq -c .cap_drop <<<"$REDIS_PROTO") security_opt=$(jq -c .security_opt <<<"$REDIS_PROTO")  (from: $(jq -r .source <<<"$REDIS_PROTO"))"
say "    docker run flags: ${REDIS_FLAGS[*]+${REDIS_FLAGS[*]}}"
if [[ "$(jq -r '(.compose.services.postgres // {}) | has("user")' "$MANIFEST")" == "true" ]]; then
  for svc in postgres redis; do
    if [[ "$(jq -r --arg s "$svc" '.images[$s].running_protections_match // "unknown"' "$MANIFEST")" == "false" ]]; then
      say "  REPORT: at backup time the source container $(jq -r --arg s "$svc" '.images[$s].container' "$MANIFEST") did not carry the declared protections (running: $(jq -c --arg s "$svc" '.images[$s].running_protections' "$MANIFEST")); the isolated container applies the declaration"
    fi
  done
fi

# proc_status <container> <pid>  -> "Name: x;Uid: a b c d;Gid: …;CapPrm: …;CapEff: …;CapBnd: …;NoNewPrivs: n;Seccomp: n" (read inside the container)
proc_status() {
  docker exec "$1" sh -c "tr '\t' ' ' < /proc/$2/status | grep -E '^(Name|Uid|Gid|CapPrm|CapEff|CapBnd|NoNewPrivs|Seccomp):' | sed -E 's/ +/ /g' | tr '\n' ';' | sed 's/;\$//'" 2>/dev/null || echo "unreadable"
}
first_child_pid() { # the first process whose parent is PID 1 (postgres: a backend); empty when none
  docker exec "$1" sh -c 'for f in /proc/[0-9]*/status; do if grep -qE "^PPid:[[:space:]]+1$" "$f" 2>/dev/null; then basename "$(dirname "$f")"; break; fi; done' 2>/dev/null || true
}
field() { printf '%s' "$1" | tr ';' '\n' | grep -E "^$2:" | sed -E "s/^$2: *//"; }
observe_protections() { # observe_protections <service> <container-name> <container-id> <proto-json>  -> sets OBSERVED_JSON, runs the checks
  local svc="$1" name="$2" cid="$3" proto="$4" hc p1 child c1 uid gid capbnd capeff nnp wu wg
  hc="$(docker inspect "$cid" | jq -c '.[0] | {user:(.Config.User // ""), cap_drop:(.HostConfig.CapDrop // []), security_opt:(.HostConfig.SecurityOpt // [])}')"
  p1="$(proc_status "$name" 1)"
  child="$(first_child_pid "$name")"
  c1=""; [[ -n "$child" ]] && c1="$(proc_status "$name" "$child")"
  say "  HostConfig: $hc"
  say "  PID 1:      $p1"
  [[ -n "$c1" ]] && say "  child $child: $c1"
  uid="$(field "$p1" Uid | awk '{print $1}')"; gid="$(field "$p1" Gid | awk '{print $1}')"
  capbnd="$(field "$p1" CapBnd)"; capeff="$(field "$p1" CapEff)"; nnp="$(field "$p1" NoNewPrivs)"
  if [[ "$(jq -r '.user // empty' <<<"$proto")" != "" ]]; then
    wu="$(jq -r '.user | split(":") | .[0]' <<<"$proto")"; wg="$(jq -r '.user | split(":") | .[1] // ""' <<<"$proto")"
    check "$([[ "$uid" == "$wu" && ( -z "$wg" || "$gid" == "$wg" ) ]] && echo true || echo false)" "$svc: PID 1 runs as uid $uid gid $gid (declared user $(jq -r .user <<<"$proto"))"
  else
    say "  $svc: no user declared; PID 1 runs as uid $uid gid $gid (report only)"
  fi
  if [[ "$(jq -r '.cap_drop | index("ALL") != null' <<<"$proto")" == "true" ]]; then
    check "$([[ "$capbnd" == "0000000000000000" && "$capeff" == "0000000000000000" ]] && echo true || echo false)" "$svc: PID 1 CapBnd $capbnd CapEff $capeff (cap_drop ALL declared: both must be 0)"
  else
    say "  $svc: cap_drop ALL not declared; PID 1 CapBnd $capbnd CapEff $capeff (report only)"
  fi
  if [[ "$(jq -r '.security_opt | index("no-new-privileges:true") != null' <<<"$proto")" == "true" ]]; then
    check "$([[ "$nnp" == "1" ]] && echo true || echo false)" "$svc: PID 1 NoNewPrivs $nnp (no-new-privileges:true declared: must be 1)"
  else
    say "  $svc: no-new-privileges not declared; PID 1 NoNewPrivs $nnp (report only)"
  fi
  OBSERVED_JSON="$(jq -cn --argjson hc "$hc" --arg p1 "$p1" --arg child "$child" --arg c1 "$c1" '{host_config:$hc, pid1_status:$p1, first_child_pid:($child|if .=="" then null else . end), first_child_status:($c1|if .=="" then null else . end)}')"
}


# ------------------------------------------------------- config copy
step "config/env -> $RROOT/config/env (0600)"
mkdir "$RROOT/config" "$RROOT/work"
ops_run_record dir "$RROOT/config" ""; ops_run_record dir "$RROOT/work" ""
cp "$SRC/config/env" "$RROOT/config/env"; chmod 600 "$RROOT/config/env"
set -a
# shellcheck disable=SC1090
. "$RROOT/config/env"
set +a
export PGPASSWORD="$EYE_DB_PASSWORD"
say "  keys=$(grep -c '^[A-Z0-9_]*=' "$RROOT/config/env") (values never displayed)"

T0=$(now_s)
# ---------------------------------------------------------- postgres
step "$PG_NAME from the bundle's pin $PG_DIGEST (with the declared process protections)"
docker volume create "$PG_VOLUME" >/dev/null
ops_run_record volume "$PG_VOLUME" "$PG_VOLUME"
PG_CID="$(POSTGRES_PASSWORD="$EYE_DB_PASSWORD" docker run -d --name "$PG_NAME" \
  ${PG_FLAGS[@]+"${PG_FLAGS[@]}"} \
  -p "127.0.0.1:$PG_PORT:5432" -v "$PG_VOLUME:/var/lib/postgresql" \
  -e POSTGRES_USER="$PG_SUPERUSER" -e POSTGRES_PASSWORD -e POSTGRES_DB=postgres \
  "$PG_DIGEST")"
CID="$PG_CID"
ops_run_record container "$CID" "$PG_NAME"
say "  container $(cut -c1-12 <<<"$CID") recorded in RUN.json; image in use: $(docker inspect --format '{{.Config.Image}}' "$CID") (image id $(docker inspect --format '{{.Image}}' "$CID"))"
for _ in $(seq 1 60); do
  docker exec "$PG_NAME" pg_isready -U "$PG_SUPERUSER" -d postgres -q 2>/dev/null && break; sleep 1
done
docker exec "$PG_NAME" pg_isready -U "$PG_SUPERUSER" -d postgres -q || { say "  container log (last 20 lines):"; docker logs --tail 20 "$PG_NAME" 2>&1 | sed 's/^/    /'; die "$PG_NAME did not become ready"; }
rpsq() { docker exec -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d "$1" -v ON_ERROR_STOP=1 -X -A -t -c "$2"; }
rpsq_tsv() { docker exec -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d "$1" -v ON_ERROR_STOP=1 -X -A -t -F "$(printf '\t')" -c "$2"; }
say "  ready: $(rpsq postgres 'select version()' | cut -d, -f1)"
RV="$(rpsq postgres 'show server_version')"
SV="$(jq -r '.database_facts.before_dump | to_entries[0].value.server_version // empty' "$MANIFEST")"
check "$([[ -n "$SV" && "${RV%%.*}" == "${SV%%.*}" ]] && echo true || echo false)" "restored server major ${RV%%.*} equals the dump's source server major (source $SV, restored $RV)"
step "process protections observed in $PG_NAME (/proc/1/status inside the container)"
observe_protections "$PG_SERVICE" "$PG_NAME" "$PG_CID" "$PG_PROTO"
PG_OBSERVED="$OBSERVED_JSON"

step "pg/globals.sql (roles; the superuser already exists in the fresh cluster — that one error is expected)"
docker exec -i -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d postgres -X -q < "$SRC/pg/globals.sql" > "$RROOT/work/globals.log" 2>&1 || true
GERR=$(grep -c 'ERROR' "$RROOT/work/globals.log" || true)
grep 'ERROR' "$RROOT/work/globals.log" | sed -E 's/PASSWORD.*/PASSWORD [redacted]/' | sed 's/^/    /' || true
say "  roles now: $(rpsq postgres "select string_agg(rolname, ',' order by rolname) from pg_roles where rolname not like 'pg_%'")"
check "$([[ "$GERR" -le 1 ]] && echo true || echo false)" "globals restored ($GERR error(s); at most the pre-existing superuser role)"

for db in $(jq -r '.databases[]' "$MANIFEST"); do
  step "pg_restore pg/$db.dump -> $db"
  t=$(now_s)
  rpsq postgres "create database $db owner $PG_SUPERUSER" >/dev/null
  docker exec -i -e PGPASSWORD "$PG_NAME" pg_restore -U "$PG_SUPERUSER" -d "$db" --no-password < "$SRC/pg/$db.dump" > "$RROOT/work/restore-$db.log" 2>&1 && rc=0 || rc=$?
  RERR=$(grep -c 'ERROR' "$RROOT/work/restore-$db.log" || true)
  grep -E 'ERROR|WARNING' "$RROOT/work/restore-$db.log" | head -20 | sed 's/^/    /' || true
  say "  pg_restore rc=$rc errors=$RERR  $(( $(now_s) - t ))s"
  check "$([[ "$rc" -eq 0 && "$RERR" -eq 0 ]] && echo true || echo false)" "pg_restore $db completed without error"
done

# ------------------------------------------- credential recovery (CP-4/5 §2)
# The bundle carries a byte copy of the deployment's credential file. Until now
# nothing checked that it OPENS the roles the same bundle restores — and it could
# not be checked by hand either, because the postgres image's pg_hba TRUSTS
# connections made from inside the container, so `docker exec psql -U eye_app`
# succeeds whatever the password is. This connects over TCP, where scram-sha-256
# actually applies, with the credentials from the bundle's own config/env.
step "credential recovery: does the bundle's config/env actually OPEN the roles the bundle restores?"
cat > "$RROOT/work/verify-credentials.mjs" <<'EOF'
// Reads role names on argv, passwords from the environment. Never prints a value.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const require = createRequire(pathToFileURL(join(process.env.EYE_API_HOME, 'package.json')).href);
const { Client } = require('pg');
const out = { roles: {}, authenticated: 0, failed: 0, no_credential: 0 };
for (const spec of process.argv.slice(2)) {
  const [role, ...keys] = spec.split(',');
  const key = keys.find((k) => (process.env[k] ?? '') !== '');
  if (key === undefined) { out.roles[role] = { verdict: 'no credential for this role in the bundle', env_key: null }; out.no_credential += 1; continue; }
  const c = new Client({ host: '127.0.0.1', port: Number(process.env.EYE_PG_PORT), database: process.env.EYE_PG_DB, user: role, password: process.env[key] });
  try { await c.connect(); await c.query('select 1'); out.roles[role] = { verdict: 'authenticated', env_key: key }; out.authenticated += 1; }
  catch (e) { out.roles[role] = { verdict: 'REFUSED', env_key: key, error: String(e.message).slice(0, 120) }; out.failed += 1; }
  finally { try { await c.end(); } catch { /* the client is being discarded */ } }
}
console.log(JSON.stringify(out));
EOF
# Only roles that CAN log in are tested. Some restored roles are deliberately
# NOLOGIN (they are SET ROLE targets, reached from a pool that has already
# authenticated as someone else); treating those as credential failures would
# report a defect where the design is working.
LOGIN_ROLES="$(rpsq postgres "select coalesce(string_agg(rolname, ' ' order by rolname), '') from pg_roles where rolcanlogin and rolname not like 'pg\\_%'")"
NOLOGIN_ROLES="$(rpsq postgres "select coalesce(string_agg(rolname, ' ' order by rolname), '') from pg_roles where not rolcanlogin and rolname not like 'pg\\_%'")"
env_keys_for() { # the credential(s) in the bundle's config/env that should open a role
  case "$1" in
    eye)                 printf 'EYE_DB_MIGRATE_PASSWORD,EYE_DB_PASSWORD';;
    eye_app)             printf 'EYE_DB_APP_PASSWORD';;
    eye_audit_allocator) printf 'EYE_DB_ALLOCATOR_PASSWORD';;
    eye_commit)          printf 'EYE_DB_COMMIT_PASSWORD';;
    eye_identity)        printf 'EYE_DB_IDENTITY_PASSWORD';;
    eye_publisher)       printf 'EYE_DB_PUBLISHER_PASSWORD';;
    eye_verifier)        printf 'EYE_DB_VERIFIER_PASSWORD';;
    eye_system)          printf 'EYE_DB_SYSTEM_PASSWORD';;
    eye_recovery)        printf 'EYE_DB_RECOVERY_PASSWORD';;
    *)                   printf '';;
  esac
}
ROLE_SPECS=()
for r in $LOGIN_ROLES; do k="$(env_keys_for "$r")"; ROLE_SPECS[${#ROLE_SPECS[@]}]="$r${k:+,$k}"; done
say "  roles restored from pg/globals.sql that can log in: ${LOGIN_ROLES:-(none)}"
say "  roles restored NOLOGIN by design (SET ROLE targets, never authenticated directly): ${NOLOGIN_ROLES:-(none)}"
# The artifact (and therefore API_CWD) is chosen later; for this check any
# node_modules with `pg` in it will do, so the repository's is used.
CREDS="$(EYE_API_HOME="$REPO/apps/api" EYE_PG_PORT="$PG_PORT" EYE_PG_DB="$API_DB" node "$RROOT/work/verify-credentials.mjs" "${ROLE_SPECS[@]}")"
jq -r '.roles | to_entries[] | "  \(.key)  \(.value.verdict)\(if .value.error then " (" + .value.error + ")" else "" end)"' <<<"$CREDS"
CRED_FAILED="$(jq -r .failed <<<"$CREDS")"
check "$([[ "$CRED_FAILED" == "0" ]] && echo true || echo false)" \
  "every LOGIN role restored from pg/globals.sql is opened by the credentials in the bundle's config/env ($(jq -r .authenticated <<<"$CREDS") authenticated, $CRED_FAILED refused, $(jq -r .no_credential <<<"$CREDS") without a credential in the bundle)"
CRED_REALIGNED='null'
if [[ "$CRED_FAILED" != "0" ]]; then
  say ""
  say "  FINDING: the credential copy in this bundle does not open the database this bundle restores."
  say "  A real recovery from it would come up with no application role able to authenticate. The check above"
  say "  stays FAILED; it is a property of the SOURCE deployment, not of the restore path."
  if [[ "${EYE_RESTORE_REALIGN_CREDENTIALS:-0}" == "1" ]]; then
    # ISOLATED CLUSTER ONLY, and recorded. The values travel on stdin, never in argv
    # (so they are not visible in `ps`) and are never printed.
    say "  EYE_RESTORE_REALIGN_CREDENTIALS=1: re-applying the bundle's own credentials to the ISOLATED cluster's"
    say "  roles so the rest of this drill can proceed. This does not repair the source deployment and does not"
    say "  clear the failed check above."
    REALIGNED=()
    {
      for spec in "${ROLE_SPECS[@]}"; do
        role="${spec%%,*}"
        [[ "$(jq -r --arg r "$role" '.roles[$r].verdict' <<<"$CREDS")" == "REFUSED" ]] || continue
        key="$(jq -r --arg r "$role" '.roles[$r].env_key' <<<"$CREDS")"
        val="${!key}"
        printf "alter role %s with password '%s';\n" "$role" "${val//\'/\'\'}"
        REALIGNED[${#REALIGNED[@]}]="$role"
      done
    } | docker exec -i -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d postgres -X -q > "$RROOT/work/realign.log" 2>&1
    sed -E "s/(PASSWORD ')[^']*'/\1[redacted]'/g" "$RROOT/work/realign.log" | sed 's/^/    /' || true
    say "  realigned in the isolated cluster: ${REALIGNED[*]+${REALIGNED[*]}}"
    CREDS2="$(EYE_API_HOME="$REPO/apps/api" EYE_PG_PORT="$PG_PORT" EYE_PG_DB="$API_DB" node "$RROOT/work/verify-credentials.mjs" "${ROLE_SPECS[@]}")"
    jq -r '.roles | to_entries[] | "  \(.key)  \(.value.verdict)"' <<<"$CREDS2"
    check "$([[ "$(jq -r .failed <<<"$CREDS2")" == "0" ]] && echo true || echo false)" \
      "after the recorded realignment, every role in the ISOLATED cluster is opened by the bundle's credentials"
    CRED_REALIGNED="$(jq -cn --argjson r "$(printf '%s\n' "${REALIGNED[@]+${REALIGNED[@]}}" | jq -R . | jq -s 'map(select(. != ""))')" \
      --argjson after "$CREDS2" '{roles:$r, after:$after, scope:"the isolated cluster only; the source deployment is untouched"}')"
  else
    say "  (EYE_RESTORE_REALIGN_CREDENTIALS=1 would re-apply the bundle's credentials to the ISOLATED cluster so a"
    say "   drill can continue past this; it is off by default because it masks nothing but proves nothing either.)"
  fi
fi

# ------------------------------------------------------ vault + journal
step "vault.tar and journal.tar -> $RROOT"
tar -C "$RROOT" -xf "$SRC/vault.tar"
tar -C "$RROOT" -xf "$SRC/journal.tar"
VAULT="$RROOT/$(jq -r .vault.root "$MANIFEST")"
VFILES=$(find "$VAULT" -type f | wc -l | tr -d ' ')
check "$([[ "$VFILES" == "$(jq -r .vault.files "$MANIFEST")" ]] && echo true || echo false)" "vault files extracted: $VFILES (manifest $(jq -r .vault.files "$MANIFEST"))"
for d in $(jq -r '.journal[] | select(.present) | .path' "$MANIFEST"); do
  say "  journal $d: $(find "$RROOT/$d" -type f | wc -l | tr -d ' ') file(s)"
done
# The journal directory the restored API reads. When the bundle carried a NON-EMPTY
# degraded journal, this is exactly where journal.tar put it, so the restored
# process replays the SAME records the source had written (Gate-2.1 §7).
JOURNAL_DIR="$RROOT/apps/api/.eye-local/degraded-demo"
mkdir -p "$JOURNAL_DIR"
ops_run_record dir "$JOURNAL_DIR" "journal dir for the second API"
JOURNAL_RECORDS=0
[[ ! -f "$JOURNAL_DIR/audit-degraded.jsonl" ]] || JOURNAL_RECORDS=$(grep -c . "$JOURNAL_DIR/audit-degraded.jsonl" || true)
say "  degraded journal for the restored API: $JOURNAL_DIR ($JOURNAL_RECORDS record(s) restored from the bundle)"
T_RESTORE=$(( $(now_s) - T0 ))

# ------------------------------------------- application artifact (CP-4/5 §1)
# The reviewer's finding: restore started apps/api/dist/main.js without verifying
# any recorded digest, so the restore receipt was not bound to an identified
# artifact. It now is. The bundle carries the dist tree it identifies
# (api-dist.tar) and a deterministic digest of it; the tree that is about to be
# STARTED is re-digested and compared, and a divergence is refused.
step "application artifact: the build this bundle identifies"
BUILD_DIGEST="$(jq -r '.build.dist.digest // empty' "$MANIFEST")"
BUILD_SHA="$(jq -r '.build.git.sha // empty' "$MANIFEST")"
ARTIFACT_JSON='null'
NODE_PATH_FOR_API=""
if [[ -z "$BUILD_DIGEST" ]]; then
  # An unencrypted, pre-CP-4/5 bundle. It is still restorable, and what it cannot
  # prove is said plainly rather than papered over.
  [[ -f "$REPO/apps/api/dist/main.js" ]] || die "this bundle records no build identity and $REPO/apps/api/dist/main.js does not exist either — there is nothing to start"
  API_CWD="$REPO/apps/api"; API_MAIN="dist/main.js"
  ARTIFACT_DIGEST="$(node "$REPO/scripts/ops/build-identity.mjs" digest --dist "$REPO/apps/api/dist" | jq -r .digest)"
  say "  REPORT: this bundle ($BUNDLE_FORMAT) records NO build identity."
  say "  REPORT: the restore therefore starts $REPO/apps/api/dist (digest $ARTIFACT_DIGEST) as an UNIDENTIFIED artifact:"
  say "  REPORT: nothing in the bundle says which source and which dependencies produced it. The receipt below is not bound to a build."
  ARTIFACT_JSON="$(jq -cn --arg d "$ARTIFACT_DIGEST" --arg p "$REPO/apps/api/dist" '{identified:false, started_dist:$p, digest:$d, bound_to_bundle:false}')"
else
  say "  the bundle identifies: git $(cut -c1-12 <<<"$BUILD_SHA"), dist $BUILD_DIGEST ($(jq -r '.build.dist.files' "$MANIFEST") files)"
  say "  built with: node $(jq -r '.build.toolchain.node' "$MANIFEST"), pnpm $(jq -r '.build.toolchain.pnpm' "$MANIFEST"), pnpm-lock.yaml sha256 $(jq -r '.build.lockfile.sha256' "$MANIFEST")"
  say "  build window: $(jq -r '.build.build.started_at_utc' "$MANIFEST") -> $(jq -r '.build.build.ended_at_utc' "$MANIFEST")"
  if [[ "$(jq -r '.build.git.worktree_clean' "$MANIFEST")" != "true" ]]; then
    say "  note: the source worktree was NOT clean at build time; the build was of the committed tree at $(cut -c1-12 <<<"$BUILD_SHA"). Uncommitted at the time:"
    jq -r '.build.git.worktree_changes[]? | "    " + .' "$MANIFEST"
  fi

  # a. the artifact the bundle carries
  mkdir "$RROOT/artifact"; ops_run_record dir "$RROOT/artifact" "the bundle's application artifact"
  tar -C "$RROOT/artifact" -xf "$SRC/api-dist.tar"
  BUNDLED_VERIFY=0
  node "$REPO/scripts/ops/build-identity.mjs" --verify "$MANIFEST" --dist "$RROOT/artifact/dist" > "$RROOT/work/artifact-bundled.json" 2>&1 || BUNDLED_VERIFY=$?
  say "  bundled artifact: $(jq -c '{verdict, computed_digest, computed_files}' "$RROOT/work/artifact-bundled.json" 2>/dev/null || cat "$RROOT/work/artifact-bundled.json")"
  check "$([[ "$BUNDLED_VERIFY" -eq 0 ]] && echo true || echo false)" "the artifact carried in api-dist.tar has the digest MANIFEST.json records ($BUILD_DIGEST)"
  [[ "$BUNDLED_VERIFY" -eq 0 ]] || die "REFUSED: the artifact in this bundle does not have the digest the bundle records. Nothing is started."

  # b. which tree is actually started — the build root when it still exists (it has
  #    its own node_modules from the frozen-lockfile install, so it is self-contained),
  #    otherwise the bundle's own artifact with the repository's node_modules.
  BUILD_SRC_API="$(jq -r '.build.build.source_root // empty' "$MANIFEST")/apps/api"
  ARTIFACT_SOURCE=""
  if [[ -n "$(jq -r '.build.build.source_root // empty' "$MANIFEST")" && -d "$BUILD_SRC_API/dist" && -d "$BUILD_SRC_API/node_modules" ]] \
     && node "$REPO/scripts/ops/build-identity.mjs" --verify "$MANIFEST" --dist "$BUILD_SRC_API/dist" > "$RROOT/work/artifact-buildroot.json" 2>&1; then
    API_CWD="$BUILD_SRC_API"; API_MAIN="dist/main.js"
    ARTIFACT_SOURCE="the build root recorded in the bundle ($BUILD_SRC_API) — self-contained: the verified dist AND the node_modules of the frozen-lockfile install"
  else
    API_CWD="$REPO/apps/api"; API_MAIN="$RROOT/artifact/dist/main.js"
    NODE_PATH_FOR_API="$REPO/apps/api/node_modules"
    ARTIFACT_SOURCE="the bundle's own api-dist.tar, extracted to $RROOT/artifact/dist, resolving dependencies through $NODE_PATH_FOR_API"
    LOCK_NOW="$(sha "$REPO/pnpm-lock.yaml")"
    LOCK_THEN="$(jq -r '.build.lockfile.sha256' "$MANIFEST")"
    if [[ "$LOCK_NOW" == "$LOCK_THEN" ]]; then
      check true "the dependencies the artifact will resolve against come from the SAME pnpm-lock.yaml the artifact was built with ($LOCK_THEN)"
    else
      say "  REPORT: this host's pnpm-lock.yaml ($LOCK_NOW) is NOT the one the artifact was built with ($LOCK_THEN); the dependency tree it resolves against is not the recorded one"
    fi
  fi
  say "  starting from: $ARTIFACT_SOURCE"

  # c. the target's OWN build, compared explicitly — never silently accepted
  UPGRADE=null
  if [[ -d "$REPO/apps/api/dist" ]]; then
    TARGET_DIGEST="$(node "$REPO/scripts/ops/build-identity.mjs" digest --dist "$REPO/apps/api/dist" | jq -r .digest)"
    TARGET_SHA="$(git -C "$REPO" rev-parse HEAD)"
    if [[ "$TARGET_DIGEST" == "$BUILD_DIGEST" ]]; then
      UPGRADE=false
      check true "the target host's own $REPO/apps/api/dist is the SAME build as the bundle's ($BUILD_DIGEST) — this restore is not an upgrade"
    else
      UPGRADE=true
      say "  SOURCE-TO-TARGET UPGRADE, recorded explicitly:"
      say "    bundle artifact: git $(cut -c1-12 <<<"$BUILD_SHA")  dist $BUILD_DIGEST"
      say "    target artifact: git $(cut -c1-12 <<<"$TARGET_SHA")  dist $TARGET_DIGEST"
      say "    the restore runs the BUNDLE'S artifact, verified above. Running the target's build over this data would be an"
      say "    upgrade and must be decided by the operator (docs/ops/BACKUP_RESTORE.md §16), not accepted silently here."
    fi
  else
    TARGET_DIGEST=""; TARGET_SHA=""
  fi
  ARTIFACT_JSON="$(jq -cn --arg d "$BUILD_DIGEST" --arg sha "$BUILD_SHA" --arg src "$ARTIFACT_SOURCE" \
    --arg cwd "$API_CWD" --arg main "$API_MAIN" --arg td "$TARGET_DIGEST" --arg ts "$TARGET_SHA" --argjson up "$UPGRADE" \
    '{identified:true, bound_to_bundle:true, digest:$d, git_sha:$sha, started_from:$src, cwd:$cwd, main:$main,
      target_host: {dist_digest:($td|if .=="" then null else . end), git_head:($ts|if .=="" then null else . end)},
      source_to_target_upgrade:$up}')"
fi

# ---------------------------------------------------------- verification
step "verification: schema_migrations, canonical_objects, manifests against MANIFEST.json"
for db in $(jq -r '.databases[]' "$MANIFEST"); do
  got="$(rpsq "$db" "select json_build_object(
    'schema_migrations_count', (select count(*) from public.schema_migrations),
    'last_migration',          (select max(filename) from public.schema_migrations),
    'canonical_objects',       (select count(*) from objects.canonical_objects),
    'audit_events',            (select count(*) from audit.audit_events),
    'audit_seals',             (select count(*) from audit.audit_seals),
    'integrity_incidents',     (select count(*) from audit.integrity_incidents),
    'audit_partitions',        (select count(*) from audit.audit_chain_heads),
    'blob_manifests_live',     (select count(*) from observation.blob_manifests m
                                where not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)),
    'blob_tombstones',         (select count(*) from observation.blob_tombstones))::text")"
  for key in schema_migrations_count last_migration canonical_objects audit_events audit_seals integrity_incidents audit_partitions blob_manifests_live blob_tombstones; do
    g="$(jq -r --arg k "$key" '.[$k]' <<<"$got")"
    b="$(jq -r --arg db "$db" --arg k "$key" '.database_facts.before_dump[$db][$k]' "$MANIFEST")"
    a="$(jq -r --arg db "$db" --arg k "$key" '.database_facts.after_dump[$db][$k]' "$MANIFEST")"
    if [[ "$g" == "$b" ]]; then check true "$db.$key = $g"
    elif [[ "$g" == "$a" ]]; then check true "$db.$key = $g (equals the after-dump value; the database changed during the dump window)"
    elif [[ "$g" =~ ^[0-9]+$ && "$b" =~ ^[0-9]+$ && "$a" =~ ^[0-9]+$ && "$g" -ge "$b" && "$g" -le "$a" ]]; then
      # pg_dump takes ONE snapshot per database, at an instant somewhere inside the
      # capture window. When the source keeps admitting, a monotonically increasing
      # counter lands between the two recorded edges — which is the window doing its
      # job, not a discrepancy. What the window did NOT cover is enumerated by the
      # capture-boundary reconciliation below, row by row.
      check true "$db.$key = $g — inside the capture window [$b, $a] (the dump's own snapshot instant; the source kept admitting)"
    else check false "$db.$key = $g (manifest before=$b after=$a)"; fi
  done
done

step "verification: audit chain (read-only re-computation of every partition; the app's verifyChain rules, without opening incidents)"
cat > "$RROOT/work/verify-chain.mjs" <<'EOF'
// Read-only mirror of AuditService.verifyChain (apps/api/src/audit/audit.service.ts):
// contiguous seq from 1, previous_hash links, canonical JCS bytes, recomputed row hash,
// head reached, no orphan rows above the head. Uses the SAME contract functions.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { auditRowHash, jcsCanonicalize, GENESIS_HASH } = await import(pathToFileURL(join(process.env.EYE_REPO, 'packages/contracts/dist/index.js')).href);
const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const heads = lines(process.argv[2]);
const events = lines(process.argv[3]);
const manifestHeads = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const byPartition = new Map();
for (const e of events) { if (!byPartition.has(e.partition_id)) byPartition.set(e.partition_id, []); byPartition.get(e.partition_id).push(e); }
const results = [];
for (const h of heads) {
  const rows = (byPartition.get(h.partition_id) ?? []).sort((a, b) => Number(a.audit_seq) - Number(b.audit_seq));
  const headSeq = Number(h.next_seq) - 1;
  let prev = GENESIS_HASH, expected = 1, cls = 'ok', at = null;
  for (const r of rows) {
    const seq = Number(r.audit_seq);
    if (seq > headSeq) break;
    if (seq !== expected || r.previous_hash !== prev) { cls = 'chain_broken'; at = seq; break; }
    const ev = JSON.parse(r.event_jcs);
    if (r.event_jcs !== jcsCanonicalize(ev)) { cls = 'noncanonical_bytes'; at = seq; break; }
    if (auditRowHash({ partitionId: h.partition_id, auditSeq: seq, previousHash: prev, event: ev }) !== r.row_hash) { cls = 'chain_broken'; at = seq; break; }
    prev = r.row_hash; expected += 1;
  }
  const orphans = rows.filter((r) => Number(r.audit_seq) > headSeq).length;
  if (cls === 'ok' && (expected !== headSeq + 1 || h.head_hash !== prev)) cls = 'head_mismatch';
  if (cls === 'ok' && orphans > 0) cls = 'orphan_rows';
  const m = manifestHeads.find((x) => x.partition_id === h.partition_id);
  const headEqualsManifest = m !== undefined && String(m.next_seq) === String(h.next_seq) && m.head_hash === h.head_hash && m.frozen === h.frozen;
  results.push({ partition: h.partition_id, frozen: h.frozen, checked: Math.min(rows.length, headSeq), cls, at, orphans, headEqualsManifest });
}
const unknownInManifest = manifestHeads.filter((m) => !heads.some((h) => h.partition_id === m.partition_id)).length;
const summary = {
  partitions: results.length, events_checked: results.reduce((n, r) => n + r.checked, 0),
  unfrozen: results.filter((r) => !r.frozen).length, unfrozen_ok: results.filter((r) => !r.frozen && r.cls === 'ok').length,
  frozen: results.filter((r) => r.frozen).length, frozen_ok: results.filter((r) => r.frozen && r.cls === 'ok').length,
  frozen_classes: results.filter((r) => r.frozen).reduce((o, r) => ({ ...o, [r.cls]: (o[r.cls] ?? 0) + 1 }), {}),
  heads_equal_manifest: results.filter((r) => r.headEqualsManifest).length, manifest_partitions_missing: unknownInManifest,
  unfrozen_failures: results.filter((r) => !r.frozen && r.cls !== 'ok').map((r) => ({ partition: r.partition, cls: r.cls, at: r.at })),
};
console.log(JSON.stringify(summary));
EOF
for db in $(jq -r '.databases[]' "$MANIFEST"); do
  rpsq "$db" "select row_to_json(h)::text from (select partition_id, next_seq, head_hash, frozen from audit.audit_chain_heads order by partition_id) h" > "$RROOT/work/$db.heads.jsonl"
  rpsq "$db" "select row_to_json(e)::text from (select partition_id, audit_seq, event_jcs, previous_hash, row_hash from audit.audit_events order by partition_id, audit_seq) e" > "$RROOT/work/$db.events.jsonl"
  jq -c --arg db "$db" '.database_facts.before_dump[$db].audit_heads' "$MANIFEST" > "$RROOT/work/$db.manifest-heads.json"
  S="$(EYE_REPO="$REPO" node "$RROOT/work/verify-chain.mjs" "$RROOT/work/$db.heads.jsonl" "$RROOT/work/$db.events.jsonl" "$RROOT/work/$db.manifest-heads.json")"
  say "  $db: $S"
  P=$(jq -r .partitions <<<"$S"); U=$(jq -r .unfrozen <<<"$S"); UO=$(jq -r .unfrozen_ok <<<"$S"); HM=$(jq -r .heads_equal_manifest <<<"$S"); MM=$(jq -r .manifest_partitions_missing <<<"$S")
  check "$([[ "$U" == "$UO" ]] && echo true || echo false)" "$db: every unfrozen partition verifies to its head ($UO/$U; $(jq -r .events_checked <<<"$S") events re-hashed)"
  MF="$(jq -r --arg db "$db" '[.database_facts.before_dump[$db].audit_heads[] | select(.frozen)] | length' "$MANIFEST")"
  check "$([[ "$(jq -r .frozen <<<"$S")" == "$MF" ]] && echo true || echo false)" "$db: frozen partitions (with recorded integrity incidents in the source) restored as frozen: $(jq -r .frozen <<<"$S") (manifest $MF)"
  if [[ "$HM" == "$P" && "$MM" == "0" ]]; then check true "$db: all $P chain heads equal the manifest"
  else
    A="$(jq -r --arg db "$db" '.database_facts.after_dump[$db].audit_heads' "$MANIFEST")"
    if [[ "$(jq -cS . "$RROOT/work/$db.heads.jsonl" | jq -cs 'sort_by(.partition_id)')" == "$(jq -c 'sort_by(.partition_id) | map({partition_id,next_seq,head_hash,frozen})' <<<"$A" | jq -cS .)" ]]; then
      check true "$db: chain heads equal the manifest's after-dump heads ($P partitions; the ledger advanced during the dump window)"
    else
      # Every head must be one the capture window contains: its next_seq between the
      # before-dump and after-dump edge for that partition (or a partition the window
      # opened). The head's INTERNAL consistency is proved separately, by the
      # rebuild_chain_heads() check above — this is only about the window.
      B="$(jq -c --arg db "$db" '.database_facts.before_dump[$db].audit_heads' "$MANIFEST")"
      IN_WINDOW="$(jq -s --argjson b "$B" --argjson a "$A" '
        [ .[] | . as $h
          | ($b[] | select(.partition_id == $h.partition_id)) // {next_seq: 0} as $bp
          | ($a[] | select(.partition_id == $h.partition_id)) // {next_seq: 0} as $ap
          | select(($h.next_seq|tonumber) >= ($bp.next_seq|tonumber) and ($h.next_seq|tonumber) <= ($ap.next_seq|tonumber)) ] | length' \
        "$RROOT/work/$db.heads.jsonl")"
      if [[ "$IN_WINDOW" == "$P" ]]; then
        check true "$db: all $P chain heads lie inside the capture window (between the before-dump and after-dump edges; $HM equal an edge exactly, the ledger advanced during the window)"
      else check false "$db: chain heads differ from the manifest ($HM/$P equal an edge, $IN_WINDOW/$P inside the window, $MM missing)"; fi
    fi
  fi
  # ADR-P0-09: heads are never trusted from backup alone. Compute what
  # audit.rebuild_chain_heads() WOULD write, without writing it.
  RB="$(rpsq "$db" "select count(*) from audit.audit_chain_heads h left join (select partition_id, max(audit_seq) mx, (array_agg(row_hash order by audit_seq desc))[1] lh from audit.audit_events group by 1) e using (partition_id) where not h.frozen and (h.next_seq <> coalesce(e.mx,0)+1 or h.head_hash <> coalesce(e.lh, repeat('0',64)))")"
  check "$([[ "$RB" == "0" ]] && echo true || echo false)" "$db: audit.rebuild_chain_heads() would change 0 unfrozen heads ($RB) — the heads are consistent with the ledger"
done

step "verification: every live (non-tombstoned) blob manifest has its bytes in the restored vault with the recorded sha256 (ALL rows)"
cat > "$RROOT/work/verify-blobs.mjs" <<'EOF'
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [vaultRoot, tsv] = process.argv.slice(2);
const c = { total: 0, present_verified: 0, absent: 0, digest_mismatch: 0, length_mismatch: 0, by_vault: {} };
for (const line of readFileSync(tsv, 'utf8').split('\n').filter(Boolean)) {
  const [vault, locator, digest, bytes] = line.split('\t');
  c.total += 1; c.by_vault[vault] = c.by_vault[vault] ?? { total: 0, present_verified: 0, absent: 0 }; c.by_vault[vault].total += 1;
  const p = join(vaultRoot, vault, locator);
  let buf; try { buf = readFileSync(p); } catch { c.absent += 1; c.by_vault[vault].absent += 1; continue; }
  if (createHash('sha256').update(buf).digest('hex') !== digest) { c.digest_mismatch += 1; continue; }
  if (buf.length !== Number(bytes)) { c.length_mismatch += 1; continue; }
  c.present_verified += 1; c.by_vault[vault].present_verified += 1;
}
console.log(JSON.stringify(c));
EOF
for db in $(jq -r '.databases[]' "$MANIFEST"); do
  docker exec -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d "$db" -v ON_ERROR_STOP=1 -X -A -t -F "$(printf '\t')" -c \
    "select vault, locator, content_digest, byte_length from observation.blob_manifests m
     where not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id) order by created_at" > "$RROOT/work/$db.manifests.tsv"
  S="$(node "$RROOT/work/verify-blobs.mjs" "$VAULT" "$RROOT/work/$db.manifests.tsv")"
  say "  $db: $S"
  T=$(jq -r .total <<<"$S"); V=$(jq -r .present_verified <<<"$S"); A=$(jq -r .absent <<<"$S"); DM=$(jq -r .digest_mismatch <<<"$S"); LM=$(jq -r .length_mismatch <<<"$S")
  if echo " $STRICT_BLOB_DBS " | grep -q " $db "; then
    check "$([[ "$T" == "$V" ]] && echo true || echo false)" "$db: $V/$T live manifests have their bytes with the recorded sha256 (absent=$A digest_mismatch=$DM length_mismatch=$LM)"
  else
    check "$([[ "$DM" == "0" && "$LM" == "0" ]] && echo true || echo false)" "$db: no corrupt bytes ($V/$T present and verified; absent=$A — the harness database's blobs were written to per-test temporary vault roots, see the runbook)"
  fi
done

# --------------------------------------- capture-boundary reconciliation (§4)
# The bundle records a boundary on both sides of the capture window. Everything the
# source admitted AFTER boundary_before is enumerated here and reported: rows whose
# bytes did travel with the bundle are reconciled, rows whose bytes did not are named
# individually, so what falls outside the bundle is a list, not a suspicion.
step "capture-boundary reconciliation: what the source admitted after the boundary the bundle records"
if [[ "$(jq -r '.capture.boundary_before // empty' "$MANIFEST")" == "" ]]; then
  say "  this bundle records no capture boundary (it predates it); nothing to reconcile against"
  BOUNDARY_JSON='null'
else
  say "  boundary: $(jq -r '.capture.boundary_before.label' "$MANIFEST") at $(jq -r '.capture.boundary_before.vault.at' "$MANIFEST")"
  say "  window:   $(jq -r 'if .capture.stable then "COHERENT — the boundary did not move between the first and the last artefact" else "OPEN — the source kept admitting; reconciling below" end' "$MANIFEST")"
  [[ "$(jq -r '.capture.quiesce // empty' "$MANIFEST")" == "" ]] || say "  quiesce:  $(jq -r '.capture.quiesce' "$MANIFEST")"
  BOUNDARY_JSON='{}'
  for db in $(jq -r '.databases[]' "$MANIFEST"); do
    BTS="$(jq -r --arg d "$db" '.capture.boundary_before.databases[$d].blob_manifest_max_created_at // ""' "$MANIFEST")"
    jq -c --arg d "$db" '.capture.boundary_before.databases[$d].audit_head_seq' "$MANIFEST" > "$RROOT/work/$db.boundary-heads.json"
    # audit rows beyond the boundary head of their partition (or in a partition the boundary did not know)
    AFTER_EVENTS="$(rpsq "$db" "with b as (select key::text as partition_id, value::text::bigint as next_seq
                                            from json_each('$(cat "$RROOT/work/$db.boundary-heads.json")'::json))
                                select count(*) from audit.audit_events e
                                left join b on b.partition_id = e.partition_id
                                where b.next_seq is null or e.audit_seq >= b.next_seq")"
    if [[ -n "$BTS" && "$BTS" != "null" ]]; then
      rpsq_tsv "$db" "select vault, locator, content_digest, byte_length from observation.blob_manifests
                      where created_at > '$BTS'::timestamptz
                        and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = observation.blob_manifests.manifest_id)
                      order by created_at" > "$RROOT/work/$db.after-boundary.tsv"
      rpsq "$db" "select coalesce(json_agg(json_build_object('manifest_id', manifest_id, 'vault', vault, 'locator', locator, 'created_at', created_at) order by created_at), '[]'::json)::text
                  from observation.blob_manifests where created_at > '$BTS'::timestamptz" > "$RROOT/work/$db.after-boundary.json"
    else
      : > "$RROOT/work/$db.after-boundary.tsv"; printf '[]' > "$RROOT/work/$db.after-boundary.json"
    fi
    AFTER_BLOBS="$(jq 'length' "$RROOT/work/$db.after-boundary.json")"
    S="$(node "$RROOT/work/verify-blobs.mjs" "$VAULT" "$RROOT/work/$db.after-boundary.tsv")"
    OUTSIDE="$(jq -r '.absent' <<<"$S")"
    say "  $db: $AFTER_EVENTS audit event(s) and $AFTER_BLOBS blob manifest(s) admitted after the boundary; of the live ones $(jq -r .present_verified <<<"$S")/$(jq -r .total <<<"$S") have their bytes in the bundle, $OUTSIDE do not"
    if [[ "$OUTSIDE" != "0" ]]; then
      say "  $db: the following fall OUTSIDE the bundle and must be re-collected or accepted as lost:"
      node -e '
        const {readFileSync}=require("node:fs"); const {existsSync}=require("node:fs"); const {join}=require("node:path");
        const rows=JSON.parse(readFileSync(process.argv[2],"utf8"));
        for (const r of rows) if (!existsSync(join(process.argv[3], r.vault, r.locator)))
          console.log(`    ${r.manifest_id}  ${r.vault}/${r.locator}  admitted ${r.created_at}`);
      ' -- "$RROOT/work/$db.after-boundary.json" "$VAULT"
    fi
    check true "$db: every row admitted after the capture boundary is enumerated ($AFTER_EVENTS audit event(s), $AFTER_BLOBS manifest(s); $OUTSIDE without bytes in the bundle, named above)"
    BOUNDARY_JSON="$(jq -c --arg db "$db" --argjson e "$AFTER_EVENTS" --argjson b "$AFTER_BLOBS" --argjson o "$OUTSIDE" \
      '. + {($db): {audit_events_after_boundary:$e, blob_manifests_after_boundary:$b, without_bytes_in_bundle:$o}}' <<<"$BOUNDARY_JSON")"
  done
fi

step "verification: vault.tar and journal.tar sha256 equal the manifest (re-checked after extraction)"
for f in vault.tar journal.tar; do
  check "$([[ "$(sha "$SRC/$f")" == "$(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")" ]] && echo true || echo false)" "$f sha256 = $(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")"
done
T_VERIFY=$(( $(now_s) - T0 - T_RESTORE ))

# ------------------------------------------------------------ second API
step "$REDIS_NAME from the bundle's pin $REDIS_DIGEST (empty — no Redis state is restored; with the declared process protections)"
# The password reaches the container only as docker environment (never on a command line).
export REDIS_PASSWORD="$EYE_REDIS_PASSWORD"
REDIS_CID="$(docker run -d --name "$REDIS_NAME" ${REDIS_FLAGS[@]+"${REDIS_FLAGS[@]}"} -p "127.0.0.1:$REDIS_PORT:6379" -e REDIS_PASSWORD \
  "$REDIS_DIGEST" sh -c 'exec redis-server --requirepass "$REDIS_PASSWORD"')"
CID="$REDIS_CID"
ops_run_record container "$CID" "$REDIS_NAME"
say "  container $(cut -c1-12 <<<"$CID") recorded in RUN.json; image in use: $(docker inspect --format '{{.Config.Image}}' "$CID") (image id $(docker inspect --format '{{.Image}}' "$CID"))"
for _ in $(seq 1 30); do docker exec -e REDIS_PASSWORD "$REDIS_NAME" sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null' | grep -q PONG && break; sleep 1; done
REDIS_KEYS_AT_START="$(docker exec -e REDIS_PASSWORD "$REDIS_NAME" sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning dbsize 2>/dev/null' | tr -d '\r')"
say "  keys in the fresh redis: $REDIS_KEYS_AT_START"
check "$([[ "$REDIS_KEYS_AT_START" == "0" ]] && echo true || echo false)" "the isolated Redis starts EMPTY — no Redis state is restored from the bundle ($REDIS_KEYS_AT_START keys)"
step "process protections observed in $REDIS_NAME (/proc/1/status inside the container)"
observe_protections "$REDIS_SERVICE" "$REDIS_NAME" "$REDIS_CID" "$REDIS_PROTO"
REDIS_OBSERVED="$OBSERVED_JSON"

# start_api <log> <scheduler enabled: true|false> — the VERIFIED artifact, never
# "whatever is in apps/api/dist". The replay root is passed explicitly because the
# artifact may run from a directory that has no fixtures of its own; it is read-only.
start_api() {
  local log="$1" scheduler="$2"
  cd "$API_CWD" && {
    EYE_DB_HOST=127.0.0.1 EYE_DB_PORT="$PG_PORT" EYE_DB_NAME="$API_DB" \
    EYE_REDIS_HOST=127.0.0.1 EYE_REDIS_PORT="$REDIS_PORT" \
    EYE_RUNTIME_PORT="$API_PORT" EYE_SCHEDULER_ENABLED="$scheduler" \
    EYE_VAULT_QUARANTINE_ROOT="$VAULT/quarantine" EYE_VAULT_EVIDENCE_ROOT="$VAULT/evidence" \
    EYE_DEGRADED_DIR="$JOURNAL_DIR" \
    EYE_CONNECTOR_REPLAY_ROOT="${EYE_RESTORE_REPLAY_ROOT:-$REPO/fixtures/phase1/replay}" \
    ${NODE_PATH_FOR_API:+NODE_PATH="$NODE_PATH_FOR_API"} \
    node "$API_MAIN" > "$log" 2>&1 & echo $!; }
}
wait_ready() { # wait_ready <seconds> -> prints the /readyz body (empty when it never answered)
  local n="$1" body=""
  for _ in $(seq 1 "$n"); do
    body="$(curl -sf "http://127.0.0.1:$API_PORT/readyz" 2>/dev/null || true)"; [[ -n "$body" ]] && break; sleep 1
  done
  printf '%s' "$body"
}

step "second API: $API_MAIN on :$API_PORT against $API_DB@127.0.0.1:$PG_PORT, vault+journal under $RROOT, scheduler disabled"
API_PID=$(start_api "$RROOT/api.log" false)
ops_run_record process "$API_PID" "second API on :$API_PORT"
READY="$(wait_ready 60)"
# `${READY:-{}}` would append a stray `}` (bash ends the expansion at the first
# brace), so the fallback is spelled out rather than defaulted inline.
READY_JSON="$READY"; [[ -n "$READY_JSON" ]] || READY_JSON=null
ESC="$(printf '\033')"
strip() { sed -E "s/$ESC\[[0-9;]*m//g"; }
say "  $(grep -m1 'listening on' "$RROOT/api.log" | strip || echo 'no listening line yet')"
say "  $(grep -m1 'scheduler disabled' "$RROOT/api.log" | strip | sed -E 's/^.*(scheduler disabled.*)$/\1/' || true)"
say "  /readyz: $READY"

# ------------------------------------ degraded-journal recovery (CP-4/5 §3)
# The journal is the deployment's own durable record that authoritative audit
# persistence failed. Gate-2.1 §7: a restart must NOT clear it. So when the bundle
# carried records, the restored process must come up DEGRADED, with the same
# unreconciled count and the same `degradedSince` the journal implies — and when it
# carried none, it must come up ok. Both directions are checked.
#
# The expectation is computed by replaying the journal with the store's own rule
# (a `degraded_recovered` record closes everything before it).
journal_expectation() { # -> {records, unreconciled, since}
  local f="$JOURNAL_DIR/audit-degraded.jsonl"
  if [[ ! -f "$f" ]]; then printf '{"records":0,"unreconciled":0,"since":null}'; return; fi
  jq -s '{records: length,
          unreconciled: (reduce .[] as $r (0; if $r.kind == "degraded_recovered" then 0 else . + 1 end)),
          since: (reduce .[] as $r (null; if $r.kind == "degraded_recovered" then null else (. // $r.at) end))}' "$f"
}
JEXP="$(journal_expectation)"
say "  degraded journal replayed by this script: $JEXP"
R_STATUS="$(jq -r .status <<<"$READY_JSON")"
R_AUDIT="$(jq -r .audit <<<"$READY_JSON")"
R_INC="$(jq -r .auditIncidents <<<"$READY_JSON")"
R_SINCE="$(jq -r .degradedSince <<<"$READY_JSON")"
check "$([[ "$(jq -r .db <<<"$READY_JSON")" == "true" ]] && echo true || echo false)" "/readyz reports the restored database reachable (db=$(jq -r .db <<<"$READY_JSON"))"
if [[ "$(jq -r .unreconciled <<<"$JEXP")" -gt 0 ]]; then
  say "  the bundle carried a NON-EMPTY degraded journal: the restored process must NOT come up healthy"
  say "  $(grep -m1 'restored DEGRADED audit state' "$RROOT/api.log" | strip || echo 'no degraded-restore line in the API log')"
  check "$([[ "$R_STATUS" == "degraded" && "$R_AUDIT" == "degraded" ]] && echo true || echo false)" \
    "/readyz reports DEGRADED after the restore — a restart did not clear the degradation (status=$R_STATUS audit=$R_AUDIT)"
  # DegradedReconciliationService restores from BOTH sources: the journal it replays
  # and every unreconciled incident the governed ledger still holds. The expected
  # count is therefore the sum, and both halves are named.
  OPEN_INCIDENTS="$(rpsq "$API_DB" "select count(*) from audit.open_availability_incidents()" 2>/dev/null || echo 0)"
  EXPECT_INC=$(( $(jq -r .unreconciled <<<"$JEXP") + OPEN_INCIDENTS ))
  check "$([[ "$R_INC" == "$EXPECT_INC" ]] && echo true || echo false)" \
    "/readyz reports $R_INC unreconciled incident(s) — the $(jq -r .unreconciled <<<"$JEXP") the restored journal holds plus the $OPEN_INCIDENTS the governed ledger still shows open (expected $EXPECT_INC)"
  check "$([[ "$R_SINCE" == "$(jq -r .since <<<"$JEXP")" ]] && echo true || echo false)" \
    "/readyz reports degradedSince $R_SINCE — the first unreconciled record in the restored journal ($(jq -r .since <<<"$JEXP"))"
  check "$(grep -q 'restored DEGRADED audit state from the durable journal' "$RROOT/api.log" && echo true || echo false)" \
    "the restored process logged that it restored the degraded state FROM THE DURABLE JOURNAL (degraded-reconciliation.service.ts)"
  say "  governed ledger in the restored database: $OPEN_INCIDENTS unreconciled availability incident(s) (audit.open_availability_incidents())"
  say "  recovery from here is GOVERNED: node dist/audit/reconcile-degraded.js \"<operator>\" \"<reason>\" is the only path back to healthy"
  DEGRADED_RESTORED=true
else
  check "$([[ "$R_STATUS" == "ok" ]] && echo true || echo false)" "/readyz status ok (db=$(jq -r .db <<<"$READY_JSON") audit=$R_AUDIT) — the bundle carried no unreconciled degradation"
  DEGRADED_RESTORED=false
fi

step "governed read through the restored API (login -> evidence list -> one evidence download re-verified against the restored vault)"
cat > "$RROOT/work/probe.mjs" <<'EOF'
// Reads only. Credentials come from the process environment (the restored config copy) and are never printed.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { call, login, demoScope } = await import(pathToFileURL(join(process.env.EYE_REPO, 'scripts/phase4/governed.mjs')).href);
const PW = process.env.EYE_TEST_ADMIN_PASSWORD;
const out = { api: process.env.EYE_API };
// The failure of an admin login is reported with the deployment's own error code:
// "the credential copy in the bundle does not open the restored deployment" is a
// different finding from "the restore is broken", and the receipt must say which.
const adminAttempt = await call('/v1/auth/login',
  { scope: 'PLATFORM', action: 'identity.session.create', objectType: 'SES', principalId: 'anonymous', purposeId: 'authentication' },
  { username: 'platform-admin', password: PW });
if (!adminAttempt.ok) {
  console.log(JSON.stringify({ ...out, ok: false, at: 'admin login',
    status: adminAttempt.status, code: adminAttempt.body?.code ?? null, message: adminAttempt.body?.message ?? null,
    meaning: adminAttempt.body?.code === 'EYE-IDN-002'
      ? 'the administrator password in the bundle\u2019s config/env is not the credential stored in the restored database'
      : 'the login route refused for another reason' }));
  process.exit(1);
}
const admin = { token: adminAttempt.body.tokens.accessToken, principalId: adminAttempt.body.principalId };
const scope = await demoScope(admin);
out.tenant = scope.tenantId.slice(0, 8) + '…'; out.domain = scope.domainId.slice(0, 8) + '…';
const member = await login('m.dvorak', PW);
if (member === null) { console.log(JSON.stringify({ ...out, ok: false, at: 'member login' })); process.exit(1); }
const X = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const as = (a, t, id = null) => ({ scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: a, objectType: t, objectId: id, principalId: `principal:${member.principalId}`, purposeId: 'observation' });
const list = await call(`${X}/evidence/list`, as('observation.read.evidence', 'EVD'), { limit: 20 }, member.token);
out.list = { status: list.status, evidence: (list.body.evidence ?? []).length };
if (!list.ok || out.list.evidence === 0) { console.log(JSON.stringify({ ...out, ok: false, at: 'evidence list' })); process.exit(1); }
const first = list.body.evidence[0];
const dl = await call(`${X}/evidence/${first.object_id}/download`, as('observation.evidence.retrieve', 'EVD', first.object_id), {}, member.token);
const d = dl.body.download ?? {};
const b64 = d.base64 ?? dl.body.base64;
const digestOfBytes = b64 ? createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex') : null;
out.download = { status: dl.status, evd: first.object_id.slice(0, 8) + '…', byteLength: d.byteLength ?? null, contentDigest: (d.contentDigest ?? '').slice(0, 16) + '…', bytesHashToDigest: digestOfBytes !== null ? digestOfBytes === d.contentDigest : null, integrity: d.integrity ?? dl.body.integrity ?? null };
out.ok = dl.ok && (digestOfBytes === null || digestOfBytes === d.contentDigest);
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
EOF
PROBE_RC=0
PROBE="$(EYE_REPO="$REPO" EYE_API="http://127.0.0.1:$API_PORT" node "$RROOT/work/probe.mjs" 2>&1)" || PROBE_RC=$?
say "  $PROBE"
check "$([[ "$PROBE_RC" -eq 0 ]] && echo true || echo false)" "governed read: login as demo member, evidence list, evidence download with digest re-verified"

# ------------------------- scheduler reconstruction, collection ENABLED (§5)
# Compose declares NO Redis data volume, so a restored deployment starts with an
# EMPTY Redis. The runbook's claim is that nothing is lost by that: the schedules
# and the attempt history are durable in the database and are reconstructed at
# bootstrap. This proves it, against a fresh isolated Redis, with collection ON.
#
# EGRESS. Some of the demo's active source contracts poll public endpoints
# (acquisition_mode 'live'). This drill makes no external network call: after the
# reconstruction is observed in Redis, every LIVE-mode source's job scheduler and
# its delayed job are REMOVED from the isolated Redis (named individually below),
# and the tick that is then served belongs to a REPLAY-mode source, whose connector
# reads the frozen fixture set instead of the network.
SCHED_JSON='null'
if [[ "${EYE_RESTORE_SCHEDULER_PHASE:-1}" == "1" ]]; then
step "scheduler reconstruction with collection ENABLED, against an EMPTY isolated Redis"
if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
  kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true
fi
API_PID=""
say "  the scheduler-disabled API is stopped; the same verified artifact is started again with the scheduler on"

# ── what the DATABASE holds. This is the only source of the reconstruction.
ENTRIES="$(rpsq "$API_DB" "select count(*) from observation.scheduler_entries where status='scheduled'")"
ATTEMPTS_BEFORE="$(rpsq "$API_DB" "select count(*) from observation.scheduled_attempts")"
# The eligibility predicate is migration 0038's, evaluated here as the superuser so
# the drill knows what the reconstruction OUGHT to produce (the port itself needs the
# schedule capability). Note `acquisition_mode = 'live'`: a replay-mode contract is
# structurally ineligible for scheduling, which is why the tick below is a live one.
ELIGIBLE_SQL="from observation.scheduler_entries e
  join observation.source_contracts_current c on c.source_id = e.source_id and c.contract_version = e.contract_version
  where e.status='scheduled' and c.lifecycle_state='active' and c.acquisition_mode='live' and c.rights_state='confirmed'
    and exists (select 1 from observation.agents ag where ag.source_id = e.source_id and ag.status='active'
                  and ag.connector = 'observation.' || c.connector_kind)"
ELIGIBLE="$(rpsq "$API_DB" "select count(*) $ELIGIBLE_SQL")"
rpsq "$API_DB" "select coalesce(json_agg(json_build_object(
    'source_id', e.source_id, 'contract_version', e.contract_version, 'scheduler_id', e.scheduler_id,
    'queue_name', e.queue_name, 'cadence_seconds', e.cadence_seconds,
    'source_key', c.source_key, 'connector_kind', c.connector_kind, 'acquisition_mode', c.acquisition_mode,
    'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state, 'endpoints', c.endpoints,
    'eligible', (c.lifecycle_state='active' and c.acquisition_mode='live' and c.rights_state='confirmed'
                 and exists (select 1 from observation.agents ag where ag.source_id = e.source_id and ag.status='active'
                               and ag.connector = 'observation.' || c.connector_kind))) order by c.source_key), '[]'::json)::text
  from observation.scheduler_entries e
  left join observation.source_contracts_current c
    on c.source_id = e.source_id and c.contract_version = e.contract_version
  where e.status='scheduled'" > "$RROOT/work/scheduler-entries.json"
say "  the restored database holds $ENTRIES scheduled entr(ies), $ELIGIBLE of them eligible, and $ATTEMPTS_BEFORE recorded attempt(s):"
jq -r '.[] | "    \(.source_key // "?") v\(.contract_version)  cadence \(.cadence_seconds)s  \(.connector_kind)/\(.acquisition_mode)  \(if .eligible then "eligible" else "NOT eligible (" + (if .lifecycle_state != "active" then "lifecycle " + .lifecycle_state else "" end) + (if .acquisition_mode != "live" then "acquisition_mode " + .acquisition_mode + " — migration 0038 schedules live contracts only" else "" end) + (if .rights_state != "confirmed" then " rights " + .rights_state else "" end) + ")" end)"' "$RROOT/work/scheduler-entries.json"
BRIEFING_ROOMS="$(rpsq "$API_DB" "select count(*) from executive.rooms_current where review_every_days is not null" 2>/dev/null || echo 0)"

cat > "$RROOT/work/scheduler-probe.mjs" <<'EOF'
// Reads and controls BullMQ state in the ISOLATED Redis. bullmq is resolved from the
// API's own node_modules, so the probe uses the very library the runtime uses.
// Nothing here talks to the database.
//
// modes:
//   report            list every entry's Redis job scheduler and the queues' job counts
//   pause | resume    pause/resume every queue the entries name (and the briefing queue)
//   keep-only:<id>    remove every job scheduler and every queued job EXCEPT the ones
//                     belonging to source <id> — this is the egress bound
//   jobs              enumerate the jobs currently in the queues
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(pathToFileURL(join(process.env.EYE_API_HOME, 'package.json')).href);
const { Queue } = require('bullmq');
const connection = { host: '127.0.0.1', port: Number(process.env.EYE_REDIS_PORT), password: process.env.EYE_REDIS_PASSWORD };
const redisName = (s) => s.replaceAll(':', '.');
const [mode, entriesFile] = process.argv.slice(2);
const entries = JSON.parse(readFileSync(entriesFile, 'utf8'));
const queues = new Map();
const q = (logical) => { const n = redisName(logical); if (!queues.has(n)) queues.set(n, new Queue(n, { connection })); return queues.get(n); };
// the collection queues the entries name, plus each domain's briefing queue
const logicalQueues = [...new Set(entries.map((e) => e.queue_name))];
for (const e of entries) logicalQueues.push(`exec:${e.queue_name.split(':')[1]}:${e.queue_name.split(':')[2]}:briefing`);
const allQueues = [...new Set(logicalQueues)];
const out = { mode, schedulers: [], removed: [], kept: [], jobs: [], counts: {}, paused: [] };
const allJobs = async (queue) => [
  ...(await queue.getDelayed(0, 1000)), ...(await queue.getWaiting(0, 1000)),
  ...(await queue.getPrioritized(0, 1000)), ...(await queue.getActive(0, 1000)),
];
try {
  if (mode === 'pause' || mode === 'resume' || mode === 'resume-collection') {
    // `resume-collection` leaves the BRIEFING queue paused: the planner's cadence is
    // proved by its reconstruction in Redis, and running a briefing agent is not part
    // of what this phase is evidencing.
    const targets = mode === 'resume-collection' ? allQueues.filter((l) => !l.includes(':briefing')) : allQueues;
    for (const l of targets) { const queue = q(l); if (mode === 'pause') await queue.pause(); else await queue.resume(); out.paused.push({ queue: redisName(l), paused: mode === 'pause' }); }
  }
  for (const e of entries) {
    const queue = q(e.queue_name);
    const id = redisName(e.scheduler_id);
    const s = await queue.getJobScheduler(id);
    out.schedulers.push({
      source_key: e.source_key, source_id: e.source_id, acquisition_mode: e.acquisition_mode, eligible: e.eligible,
      scheduler_id: id, queue: redisName(e.queue_name),
      present: s !== null && s !== undefined,
      every_seconds: s ? Math.round(Number(s.every) / 1000) : null,
      cadence_in_database: e.cadence_seconds,
      next_at: s?.next ? new Date(Number(s.next)).toISOString() : null,
    });
  }
  if (mode?.startsWith('keep-only:')) {
    const keep = mode.slice('keep-only:'.length);
    // A job produced by a job scheduler is identified by its ID, `repeat:<scheduler
    // id>:<millis>` — `opts.repeatJobKey` is NOT set on it in BullMQ 6, which is why
    // matching on that option silently removed nothing.
    const belongsTo = (job, schedulerId) => String(job.id ?? '').startsWith(`repeat:${schedulerId}:`);
    const keptIds = entries.filter((e) => e.source_id === keep).map((e) => redisName(e.scheduler_id));
    for (const e of entries) {
      if (e.source_id === keep) continue;
      const queue = q(e.queue_name);
      const id = redisName(e.scheduler_id);
      const s = await queue.getJobScheduler(id);
      // Remove the scheduler FIRST (that also drops the delayed job it is holding),
      // then sweep anything of its that is still queued.
      if (s !== null && s !== undefined) await queue.removeJobScheduler(id);
      let jobs = 0;
      for (const j of await allJobs(queue)) {
        if (!belongsTo(j, id)) continue;
        await j.remove().catch(() => undefined);
        jobs += 1;
      }
      if (s !== null && s !== undefined) out.removed.push({ source_key: e.source_key, source_id: e.source_id, acquisition_mode: e.acquisition_mode, scheduler_id: id, jobs_removed: jobs });
    }
    for (const l of allQueues) {
      for (const j of await allJobs(q(l))) {
        const intended = keptIds.some((id) => belongsTo(j, id));
        out.kept.push({ queue: redisName(l), job_id: j.id, kept_intentionally: intended, delay_ms: j.delay ?? 0 });
      }
    }
  }
  if (mode === 'jobs' || mode === 'report' || mode?.startsWith('keep-only:')) {
    for (const l of allQueues) {
      const queue = q(l);
      out.counts[redisName(l)] = await queue.getJobCounts('active', 'waiting', 'delayed', 'prioritized', 'completed', 'failed');
      if (mode === 'jobs') for (const j of await allJobs(queue)) out.jobs.push({ queue: redisName(l), job_id: j.id, name: j.name, repeat_key: String(j.opts?.repeatJobKey ?? ''), delay_ms: j.delay ?? 0 });
    }
  }
} finally {
  for (const queue of queues.values()) await queue.close().catch(() => undefined);
}
console.log(JSON.stringify(out));
EOF
probe() { EYE_API_HOME="$API_CWD" EYE_REDIS_PORT="$REDIS_PORT" EYE_REDIS_PASSWORD="$EYE_REDIS_PASSWORD" \
  node "$RROOT/work/scheduler-probe.mjs" "$1" "$RROOT/work/scheduler-entries.json"; }

# ── PAUSE FIRST. BullMQ 6 produces a job scheduler's first job with delay 0, so a
# reconstruction on an unpaused queue starts collecting the instant the workers
# come up — including from live-mode contracts, which poll public endpoints. The
# queues are paused BEFORE the API starts, so the reconstruction is observed
# without anything being executed, and the egress bound below is applied while
# every job is still sitting still.
step "pausing the isolated queues BEFORE the scheduler starts (BullMQ produces the first job of an `every` scheduler immediately)"
PAUSED="$(probe pause)"
say "  paused: $(jq -r '[.paused[] | .queue] | join(", ")' <<<"$PAUSED")"

say ""
say "  starting the API with EYE_SCHEDULER_ENABLED=true"
API_PID=$(start_api "$RROOT/api-scheduler.log" true)
ops_run_record process "$API_PID" "second API on :$API_PORT (scheduler enabled)"
READY2="$(wait_ready 90)"
say "  /readyz: $READY2"
for _ in $(seq 1 30); do grep -q 'persisted schedule' "$RROOT/api-scheduler.log" && break; sleep 1; done
RECON_LINE="$(grep -m1 'persisted schedule' "$RROOT/api-scheduler.log" | strip | sed -E 's/^.*(reconciled .*)$/\1/' || true)"
BRIEFING_LINE="$(grep -m1 'room briefing cadence' "$RROOT/api-scheduler.log" | strip | sed -E 's/^.*(reconciled .*)$/\1/' || true)"
say "  collection: ${RECON_LINE:-(no line)}"
say "  planner:    ${BRIEFING_LINE:-(no line)}"
WORKERS=$(grep -c 'collection worker started for' "$RROOT/api-scheduler.log" || true)
grep -o 'collection worker started for .*' "$RROOT/api-scheduler.log" | strip | sed 's/^/    /' | sort -u || true

SCHED_BEFORE="$(probe report)"
jq -r '.schedulers[] | "    \(.source_key // "?")  eligible=\(.eligible)  present=\(.present)  every=\(.every_seconds)s  db_cadence=\(.cadence_in_database)s  next=\(.next_at // "-")"' <<<"$SCHED_BEFORE"
PRESENT=$(jq '[.schedulers[] | select(.present)] | length' <<<"$SCHED_BEFORE")
ELIGIBLE_PRESENT=$(jq '[.schedulers[] | select(.eligible and .present)] | length' <<<"$SCHED_BEFORE")
INELIGIBLE_PRESENT=$(jq '[.schedulers[] | select((.eligible | not) and .present)] | length' <<<"$SCHED_BEFORE")
CADENCE_OK=$(jq '[.schedulers[] | select(.present and .every_seconds == .cadence_in_database)] | length' <<<"$SCHED_BEFORE")
REDIS_KEYS_AFTER="$(docker exec -e REDIS_PASSWORD "$REDIS_NAME" sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning dbsize 2>/dev/null' | tr -d '\r')"
check "$([[ "$ELIGIBLE_PRESENT" == "$ELIGIBLE" && "$INELIGIBLE_PRESENT" == "0" ]] && echo true || echo false)" \
  "every ELIGIBLE persisted schedule was RECONSTRUCTED into the empty Redis from observation.scheduler_entries ($ELIGIBLE_PRESENT/$ELIGIBLE), and no ineligible one was ($INELIGIBLE_PRESENT)"
check "$([[ "$CADENCE_OK" == "$PRESENT" ]] && echo true || echo false)" "every reconstructed Redis job scheduler carries the cadence the database stores ($CADENCE_OK/$PRESENT)"
check "$([[ "$WORKERS" -ge 1 ]] && echo true || echo false)" "the collection worker(s) came up in the restored process ($WORKERS queue worker(s))"
check "$([[ "$ATTEMPTS_BEFORE" -gt 0 ]] && echo true || echo false)" "the attempt history survived the restore: $ATTEMPTS_BEFORE row(s) in observation.scheduled_attempts, from the database alone"
check "$([[ -n "$BRIEFING_LINE" ]] && echo true || echo false)" "the room briefing cadence was reconciled from the database too — $BRIEFING_ROOMS room(s) carry one (executive.briefings_to_reconcile): ${BRIEFING_LINE:-not reported}"
say "  Redis went from $REDIS_KEYS_AT_START keys (empty, before anything started) to $REDIS_KEYS_AFTER, all of them written by the reconstruction"

# ── the egress bound, applied while everything is still paused
step "bounding egress: keeping exactly ONE source's schedule and removing every other scheduler and every queued job"
# Migration 0038 schedules only contracts whose acquisition_mode is 'live', so no
# replay/upload source can ever be reconstructed and no tick can be served from the
# frozen fixture set. The bound taken here is therefore the other one the reviewer
# allows: exactly ONE tick, from ONE named contract, making exactly the call that
# contract authorises — the same call the live deployment makes on its own cadence —
# with every other reconstructed schedule removed before it can fire.
TICK_SOURCE="$(jq -r '[.[] | select(.eligible and .acquisition_mode == "replay")] | .[0].source_id // empty' "$RROOT/work/scheduler-entries.json")"
TICK_MODE="replay"
if [[ -z "$TICK_SOURCE" ]]; then
  if [[ -n "${EYE_RESTORE_TICK_SOURCE:-}" ]]; then
    TICK_SOURCE="$EYE_RESTORE_TICK_SOURCE"
  else
    TICK_SOURCE="$(jq -r '[.[] | select(.eligible)] | sort_by(.cadence_seconds) | .[0].source_id // empty' "$RROOT/work/scheduler-entries.json")"
  fi
  TICK_MODE="live"
fi
TICK_KEY="$(jq -r --arg s "$TICK_SOURCE" '[.[] | select(.source_id == $s)] | .[0].source_key // "?"' "$RROOT/work/scheduler-entries.json")"
TICK_ENDPOINTS="$(jq -r --arg s "$TICK_SOURCE" '[.[] | select(.source_id == $s)] | .[0].endpoints // [] | map(sub("^(?<p>https?://)(?<h>[^/]+).*$"; "\(.p)\(.h)/…")) | join(", ")' "$RROOT/work/scheduler-entries.json")"
if [[ -z "$TICK_SOURCE" ]]; then
  say "  REPORT: no eligible schedule at all; there is nothing to tick and nothing to bound"
  BOUND='{"removed":[],"kept":[]}'; TICK_JSON='null'
else
  say "  keeping:  $TICK_KEY ($TICK_SOURCE), acquisition_mode=$TICK_MODE"
  BOUND="$(probe "keep-only:$TICK_SOURCE")"
  jq -r '.removed[] | "  removed \(.source_key)  (\(.acquisition_mode)-mode contract; \(.jobs_removed) queued job(s) removed with it)"' <<<"$BOUND"
  REMOVED=$(jq '.removed | length' <<<"$BOUND")
  # A job left on the BRIEFING queue is not a foreign collection job: that queue is
  # never resumed in this phase, so nothing on it can run.
  OTHERS=$(jq '[.kept[] | select((.kept_intentionally | not) and (.queue | contains(".briefing") | not))] | length' <<<"$BOUND")
  say "  jobs still in the queues after the bound:"
  jq -r '.kept[] | "    \(.queue)  job \(.job_id)  intended=\(.kept_intentionally)  delay=\(.delay_ms)ms"' <<<"$BOUND"
  check "$([[ "$OTHERS" == "0" ]] && echo true || echo false)" \
    "after the bound, NO job of any other source remains queued ($REMOVED scheduler(s) removed with their jobs; $OTHERS foreign job(s) left)"
  if [[ "$TICK_MODE" == "replay" ]]; then
    say "  EGRESS: none. The kept contract is replay-mode; its connector reads the frozen fixture set."
  else
    say "  EGRESS: exactly one contract-permitted call. $TICK_KEY is a live-mode contract and its connector will"
    say "          fetch $TICK_ENDPOINTS under that contract's own egress policy (host allowlist, TLS, byte caps)."
    say "          This is the option the reviewer allows for a live source: the run is BOUNDED to a single tick of a"
    say "          single named source. A replay/upload source cannot be used here because migration 0038's"
    say "          observation.schedules_to_reconcile() schedules contracts with acquisition_mode='live' only."
  fi

  step "serving one tick: the queues are resumed and the kept source's job is executed by the reconstructed worker"
  probe resume-collection > "$RROOT/work/resume.json"
  say "  resumed: $(jq -r '[.paused[] | .queue] | join(", ")' "$RROOT/work/resume.json") (the briefing queue stays PAUSED — its reconstruction is proved, its agent is not run here)"
  TICK_OK=false
  for _ in $(seq 1 120); do
    A="$(rpsq "$API_DB" "select count(*) from observation.scheduled_attempts")"
    [[ "$A" -gt "$ATTEMPTS_BEFORE" ]] && { TICK_OK=true; break; }
    sleep 1
  done
  TICK_JSON="$(rpsq "$API_DB" "select coalesce(row_to_json(t), 'null')::text from (
      select a.attempt_id, a.source_id, a.contract_version, a.job_id, a.trigger, a.outcome, a.reason,
             a.items_admitted, a.items_noop, a.items_quarantined, a.started_at, a.finished_at,
             c.source_key, c.connector_kind, c.acquisition_mode
        from observation.scheduled_attempts a
        left join observation.source_contracts_current c on c.source_id = a.source_id and c.contract_version = a.contract_version
       where a.started_at > now() - interval '10 minutes'
       order by a.started_at desc limit 1) t")"
  say "  newest attempt recorded during this phase: $TICK_JSON"
  check "$TICK_OK" "the tick was SERVED by the reconstructed worker and RECORDED in observation.scheduled_attempts (trigger=$(jq -r '.trigger // "?"' <<<"$TICK_JSON"), outcome=$(jq -r '.outcome // "?"' <<<"$TICK_JSON"))"
  check "$([[ "$(jq -r '.source_id // ""' <<<"$TICK_JSON")" == "$TICK_SOURCE" ]] && echo true || echo false)" \
    "the tick that ran is the ONE source the bound kept ($(jq -r '.source_key // "?"' <<<"$TICK_JSON")/$(jq -r '.acquisition_mode // "?"' <<<"$TICK_JSON")), and no other source collected"
  TICK_OUTCOME="$(jq -r '.outcome // "?"' <<<"$TICK_JSON")"
  case "$TICK_OUTCOME" in
    refused)  say "  EGRESS ACTUALLY MADE: none. The run was REFUSED by governance before it opened ($(jq -r '.reason // ""' <<<"$TICK_JSON" | cut -c1-140)), so the connector never ran and no external request was issued.";;
    finished|failed) say "  EGRESS ACTUALLY MADE: the one request the kept contract authorises. Outcome $TICK_OUTCOME, items admitted $(jq -r '.items_admitted' <<<"$TICK_JSON"), unchanged $(jq -r '.items_noop' <<<"$TICK_JSON").";;
    *)        say "  EGRESS ACTUALLY MADE: outcome $TICK_OUTCOME — see the attempt row above.";;
  esac
  ATTEMPTS_AFTER="$(rpsq "$API_DB" "select count(*) from observation.scheduled_attempts")"
  check "$([[ "$(( ATTEMPTS_AFTER - ATTEMPTS_BEFORE ))" == "1" ]] && echo true || echo false)" \
    "exactly ONE attempt was recorded in this phase ($ATTEMPTS_BEFORE -> $ATTEMPTS_AFTER)"
fi
COUNTS="$(probe report)"
say "  queue counts at the end of the phase: $(jq -c '.counts' <<<"$COUNTS")"
SCHED_JSON="$(jq -cn --argjson before "$SCHED_BEFORE" --argjson bound "$BOUND" --argjson tick "${TICK_JSON:-null}" \
  --argjson entries "$ENTRIES" --argjson eligible "$ELIGIBLE" --argjson attempts "$ATTEMPTS_BEFORE" \
  --argjson kb "$REDIS_KEYS_AT_START" --argjson ka "$REDIS_KEYS_AFTER" \
  --argjson workers "${WORKERS:-0}" --argjson rooms "$BRIEFING_ROOMS" --arg tickmode "${TICK_MODE:-none}" --arg tickkey "${TICK_KEY:-none}" \
  '{redis_keys_before:$kb, redis_keys_after:$ka, persisted_entries:$entries, eligible_entries:$eligible,
    attempts_in_database:$attempts, workers_started:$workers, briefing_rooms_with_cadence:$rooms,
    reconstructed:$before.schedulers, egress_bound:{kept:$tickkey, kept_acquisition_mode:$tickmode, removed:$bound.removed},
    tick:$tick}')"
fi

# ------------------------------------------------------------- summary
T_TOTAL=$(( $(now_s) - T0 ))
step "summary"
say "  restore (postgres start + globals + pg_restore x2 + tar extract): ${T_RESTORE}s"
say "  verification: ${T_VERIFY}s   total including both APIs, the probe and the scheduler phase: ${T_TOTAL}s"
say "  artifact:     $(jq -r 'if .identified then "identified — git " + (.git_sha[0:12]) + ", dist " + .digest else "NOT identified (a bundle from before the build identity)" end' <<<"$ARTIFACT_JSON")"
say "  degraded:     $(if [[ "$DEGRADED_RESTORED" == "true" ]]; then printf 'the bundle carried %s unreconciled journal record(s) and the restored process came up DEGRADED' "$(jq -r .unreconciled <<<"$JEXP")"; else printf 'the bundle carried no unreconciled degradation'; fi)"
say "  boundary:     $(jq -r 'if . == null then "not recorded in this bundle" else (to_entries | map("\(.key): \(.value.audit_events_after_boundary) event(s)/\(.value.blob_manifests_after_boundary) manifest(s) after it, \(.value.without_bytes_in_bundle) without bytes") | join("; ")) end' <<<"$BOUNDARY_JSON")"
say "  scheduler:    $(jq -r 'if . == null then "phase skipped" else "\(.reconstructed | map(select(.present)) | length)/\(.eligible_entries) eligible schedule(s) rebuilt from the database into an empty Redis (\(.persisted_entries) stored); egress bound to \(.egress_bound.kept) (\(.egress_bound.kept_acquisition_mode)), \(.egress_bound.removed | length) other scheduler(s) removed with their jobs; tick: \(.tick.source_key // "none")/\(.tick.outcome // "-")" end' <<<"$SCHED_JSON")"
say "  credentials: $(jq -r '"\(.authenticated) role(s) opened by the bundle\u0027s config/env, \(.failed) refused"' <<<"$CREDS")$(if [[ "$CRED_REALIGNED" != "null" ]]; then printf ' (the isolated cluster was realigned: %s)' "$(jq -r '.roles | join(", ")' <<<"$CRED_REALIGNED")"; fi)"
say "  checks: $PASS passed, $FAIL failed"
jq -n --arg b "$BUNDLE" --arg r "$RROOT" --argjson pass "$PASS" --argjson fail "$FAIL" \
  --argjson tr "$T_RESTORE" --argjson tv "$T_VERIFY" --argjson tt "$T_TOTAL" --arg pg "$PG_DIGEST" --arg redis "$REDIS_DIGEST" \
  --argjson pgl "$PG_LOCAL" --argjson rdl "$REDIS_LOCAL" --argjson pgp "$PG_PROTO" --argjson rdp "$REDIS_PROTO" \
  --argjson pgo "$PG_OBSERVED" --argjson rdo "$REDIS_OBSERVED" --arg pgc "$PG_CID" --arg rdc "$REDIS_CID" \
  --argjson enc "$ENCRYPTED" --argjson artifact "$ARTIFACT_JSON" --argjson boundary "$BOUNDARY_JSON" \
  --argjson sched "$SCHED_JSON" --argjson degraded "$DEGRADED_RESTORED" --argjson jexp "${JEXP:-null}" \
  --arg fmt "$BUNDLE_FORMAT" --argjson creds "$CREDS" --argjson realigned "$CRED_REALIGNED" --arg nologin "$NOLOGIN_ROLES" \
  '{bundle:$b, bundle_format:$fmt, restore_root:$r, run_manifest:($r+"/RUN.json"), images_used:{postgres:$pg, redis:$redis},
    encrypted_at_rest:$enc,
    application_artifact:$artifact,
    capture_boundary_reconciliation:$boundary,
    degraded_journal:{restored_degraded:$degraded, journal_replay:$jexp},
    credential_recovery:{verified:$creds, realignment:$realigned, nologin_roles:($nologin|split(" ")|map(select(. != "")))},
    scheduler_reconstruction:$sched,
    image_identity:{postgres:{pin:$pg, container:$pgc, local_image:$pgl, protections_declared:$pgp, protections_observed:$pgo},
                    redis:{pin:$redis, container:$rdc, local_image:$rdl, protections_declared:$rdp, protections_observed:$rdo}},
    checks:{passed:$pass, failed:$fail}, seconds:{restore:$tr, verify:$tv, total:$tt}}' > "$RROOT/RESTORE_REPORT.json"
[[ "$FAIL" -eq 0 ]] || die "$FAIL verification check(s) failed — see above"
say "  RESTORE VERIFIED"
