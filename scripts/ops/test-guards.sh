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

printf '\n== probes: application-artifact identity (scripts/ops/build-identity.mjs, stand-in trees only)\n'
# A dist tree stands in for the real one: three files, one of them nested.
AT="$T/artifact/dist"; mkdir -p "$AT/observation"
printf 'console.log("main");\n' > "$AT/main.js"
printf 'module.exports = 1;\n' > "$AT/observation/x.js"
printf '{"a":1}\n' > "$AT/asset.json"
D1="$(node "$HERE/build-identity.mjs" digest --dist "$AT" | jq -r .digest)"
# the SAME bytes at the same relative paths, in a different directory, with different mtimes
cp -R "$T/artifact" "$T/artifact-elsewhere"; find "$T/artifact-elsewhere" -type f -exec touch -t 200001010000 {} +
D2="$(node "$HERE/build-identity.mjs" digest --dist "$T/artifact-elsewhere/dist" | jq -r .digest)"
probe "the dist digest depends only on contents and relative paths (same bytes elsewhere, older mtimes, same digest)" ok \
  "$([[ "$D1" == "$D2" && "$D1" == sha256:* ]] && echo "ok: $D1" || echo "bad: $D1 vs $D2")"
# a manifest that records that digest, and a tree that has drifted from it
jq -n --arg d "$D1" '{format:"eye-build-identity/1", git:{sha:"0000000000000000000000000000000000000000"},
                      build:{dist_path:"'"$AT"'"}, dist:{digest:$d, files:3, bytes:0}}' > "$T/artifact/BUILD_IDENTITY.json"
node "$HERE/build-identity.mjs" --verify "$T/artifact/BUILD_IDENTITY.json" --dist "$AT" > "$T/artifact/same.json" 2>&1; SAME_RC=$?
probe "an unchanged artifact verifies against its recorded digest (exit 0)" ok \
  "$([[ "$SAME_RC" -eq 0 && "$(jq -r .verdict "$T/artifact/same.json")" == "identical" ]] && echo "ok: identical, exit 0" || echo "bad: rc=$SAME_RC $(cat "$T/artifact/same.json")")"
printf '// drift\n' >> "$AT/observation/x.js"
node "$HERE/build-identity.mjs" --verify "$T/artifact/BUILD_IDENTITY.json" --dist "$AT" > "$T/artifact/drift.json" 2>&1; DRIFT_RC=$?
probe "a DIVERGENT artifact is refused (exit 1) and the changed path is named" ok \
  "$([[ "$DRIFT_RC" -eq 1 && "$(jq -r .verdict "$T/artifact/drift.json")" == "divergent" ]] && echo "ok: divergent, exit 1, computed $(jq -r .computed_digest "$T/artifact/drift.json")" || echo "bad: rc=$DRIFT_RC $(cat "$T/artifact/drift.json")")"

printf '\n== probes: bundle encryption (scripts/ops/bundle-crypto.mjs, stand-in bundle only)\n'
CB="$T/crypto-bundle"; mkdir -p "$CB/pg"
head -c 65536 /dev/urandom > "$CB/pg/a.dump"
printf 'STANDIN_SECRET=not-a-real-value\n' > "$CB/env"
PLAIN_SHA="$(ops_sha256 "$CB/env")"
jq -n '{format:"eye-backup-bundle/2"}' > "$CB/MANIFEST.json"
SEAL="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" seal --bundle "$CB" --files 'pg/a.dump,env' 2>&1)"; SEAL_RC=$?
jq --argjson c "$SEAL" '. + {encryption:$c}' "$CB/MANIFEST.json" > "$CB/M.tmp" 2>/dev/null && mv "$CB/M.tmp" "$CB/MANIFEST.json"
probe "sealing removes the plaintext and leaves only ciphertext in the bundle" ok \
  "$([[ "$SEAL_RC" -eq 0 && ! -e "$CB/env" && ! -e "$CB/pg/a.dump" && -f "$CB/env.enc" && -f "$CB/pg/a.dump.enc" ]] && echo "ok: env.enc and pg/a.dump.enc present, no plaintext" || echo "bad: rc=$SEAL_RC $(ls -A "$CB" "$CB/pg" | tr '\n' ' ')")"
probe "the bundle key is nowhere in the bundle: only KDF parameters, a verification tag and the WRAPPED key are recorded" ok \
  "$([[ "$(jq -r '.encryption.kdf.algorithm' "$CB/MANIFEST.json")" == "PBKDF2-HMAC-SHA512" && "$(jq -r '.encryption | has("data_key")' "$CB/MANIFEST.json")" == "false" && -n "$(jq -r '.encryption.wrapped_data_key.tag_hex' "$CB/MANIFEST.json")" ]] && echo "ok: $(jq -c '.encryption | {cipher, kdf: (.kdf.algorithm + " x" + (.kdf.iterations|tostring)), verification_tag: (.verification_tag_hex[0:16] + "…"), wrapped_key_only: (has("data_key")|not)}' "$CB/MANIFEST.json")" || echo "bad")"
WRONG="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 2' node "$HERE/bundle-crypto.mjs" verify --bundle "$CB" 2>&1)"; WRONG_RC=$?
probe "a WRONG passphrase is refused by the verification tag, before any ciphertext is read" refused \
  "$([[ "$WRONG_RC" -ne 0 ]] && echo "refused: $(head -1 <<<"$WRONG" | sed 's/^bundle-crypto: //')" || echo "accepted: $WRONG")" "does not open this bundle"
NOPASS="$(EYE_BACKUP_PASSPHRASE= node "$HERE/bundle-crypto.mjs" verify --bundle "$CB" 2>&1)"; NOPASS_RC=$?
probe "an ABSENT passphrase is refused and never defaulted" refused \
  "$([[ "$NOPASS_RC" -ne 0 ]] && echo "refused: $(head -1 <<<"$NOPASS" | sed 's/^bundle-crypto: //')" || echo "accepted")" "EYE_BACKUP_PASSPHRASE is not set"
OPENED="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" open --bundle "$CB" --into "$T/crypto-open" 2>&1)"; OPEN_RC=$?
probe "the right passphrase opens it, byte for byte" ok \
  "$([[ "$OPEN_RC" -eq 0 && "$(ops_sha256 "$T/crypto-open/env")" == "$PLAIN_SHA" ]] && echo "ok: env recovered with sha256 $PLAIN_SHA" || echo "bad: rc=$OPEN_RC $OPENED")"
# one byte flipped in the ciphertext
printf 'X' | dd of="$CB/pg/a.dump.enc" bs=1 seek=100 conv=notrunc 2>/dev/null
TAMPER="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" open --bundle "$CB" --into "$T/crypto-open-tampered" 2>&1)"; TAMPER_RC=$?
probe "a TAMPERED ciphertext fails authentication and no plaintext is written for it" refused \
  "$([[ "$TAMPER_RC" -ne 0 && ! -e "$T/crypto-open-tampered/pg/a.dump" ]] && echo "refused: $(head -1 <<<"$TAMPER" | sed 's/^bundle-crypto: //')" || echo "accepted: rc=$TAMPER_RC")" "authentication FAILED"

printf '\n== probes: R2 — the authenticated identity of a payload is its path; the file map is authenticated; every write is contained\n'
# A fresh sealed bundle for the mapping probes (the one above has a tampered ciphertext by now).
CB2="$T/crypto-bundle-2"; mkdir -p "$CB2/pg"
printf 'payload bytes\n' > "$CB2/payload.txt"; head -c 4096 /dev/urandom > "$CB2/pg/b.dump"
SEAL2="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" seal --bundle "$CB2" --files 'payload.txt,pg/b.dump' 2>&1)"
jq -n --argjson c "$SEAL2" '{format:"eye-backup-bundle/2", encryption:$c}' > "$CB2/MANIFEST.json"
probe "the sealed map carries an authentication tag over every (path, iv, tag, digests, sizes) entry" ok \
  "$([[ "$(jq -r '.encryption.files_tag_hex | length' "$CB2/MANIFEST.json")" == "64" && "$(jq -r '.encryption.files["payload.txt"].aad' "$CB2/MANIFEST.json")" == "payload.txt" ]] && echo "ok: files_tag_hex present; aad == path" || echo "bad")"
# (a) the reviewer's reproduction: key -> ../../escaped.bin, aad retained, ciphertext where the key says
mkdir -p "$T/r2/deep/er"; cp -R "$CB2" "$T/r2/deep/er/bundle"; cp "$CB2/payload.txt.enc" "$T/r2/deep/escaped.bin.enc"
jq '.encryption.files["../../escaped.bin"] = .encryption.files["payload.txt"] | del(.encryption.files["payload.txt"])' "$CB2/MANIFEST.json" > "$T/r2/deep/er/bundle/ALTERED.json"
ESC="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" open --bundle "$T/r2/deep/er/bundle" --into "$T/r2/restore/plain" --manifest "$T/r2/deep/er/bundle/ALTERED.json" 2>&1)"; ESC_RC=$?
probe "a map key changed to a traversal path with its aad retained is refused before any write (the reviewer's reproduction)" refused \
  "$([[ "$ESC_RC" -ne 0 && -z "$(find "$T/r2" -name 'escaped.bin' -o -name '*.decrypting' 2>/dev/null)" && ! -e "$T/r2/restore/plain/pg/b.dump" ]] && echo "refused: $(head -1 <<<"$ESC" | sed 's/^bundle-crypto: //')" || echo "accepted: rc=$ESC_RC $(find "$T/r2" -name 'escaped.bin')")" "'..' segment"
# (b) a canonical sibling key with the original aad: the identity no longer matches the path
jq '.encryption.files["moved.txt"] = .encryption.files["payload.txt"] | del(.encryption.files["payload.txt"])' "$CB2/MANIFEST.json" > "$CB2/MOVED.json"; cp "$CB2/payload.txt.enc" "$CB2/moved.txt.enc"
MV="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" open --bundle "$CB2" --into "$T/r2/moved" --manifest "$CB2/MOVED.json" 2>&1)"; MV_RC=$?
probe "a payload re-pointed to another path inside the bundle (aad retained) is refused: the authenticated identity is the path" refused \
  "$([[ "$MV_RC" -ne 0 && ! -e "$T/r2/moved/moved.txt" && ! -e "$T/r2/moved/pg/b.dump" ]] && echo "refused: $(head -1 <<<"$MV" | sed 's/^bundle-crypto: //')" || echo "accepted: rc=$MV_RC")" "is not its path"
# (c) an entry removed from the map, everything else intact, aad == key everywhere
jq 'del(.encryption.files["pg/b.dump"])' "$CB2/MANIFEST.json" > "$CB2/PRUNED.json"
PR="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" verify --bundle "$CB2" --manifest "$CB2/PRUNED.json" 2>&1)"; PR_RC=$?
probe "a map with an entry removed (every remaining record consistent) is refused by the map tag before any ciphertext is read" refused \
  "$([[ "$PR_RC" -ne 0 ]] && echo "refused: $(head -1 <<<"$PR" | sed 's/^bundle-crypto: //')" || echo "accepted: $PR")" "file map does not authenticate"
# (d) the destination carries a symlinked subdirectory pointing outside it
mkdir -p "$T/r2/outside" "$T/r2/linked"; ln -s "$T/r2/outside" "$T/r2/linked/pg"
LN="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" open --bundle "$CB2" --into "$T/r2/linked" 2>&1)"; LN_RC=$?
probe "a symlinked ancestor inside the destination is refused and nothing is written through it" refused \
  "$([[ "$LN_RC" -ne 0 && -z "$(ls -A "$T/r2/outside")" && ! -e "$T/r2/linked/payload.txt" ]] && echo "refused: $(head -1 <<<"$LN" | sed 's/^bundle-crypto: //')" || echo "accepted: rc=$LN_RC outside=$(ls -A "$T/r2/outside" | tr '\n' ' ')")" "is a symlink"
# (e) the intact bundle still opens, byte for byte, into a fresh destination
OK2="$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' node "$HERE/bundle-crypto.mjs" open --bundle "$CB2" --into "$T/r2/ok" 2>&1)"; OK2_RC=$?
probe "the intact map still opens into its destination, byte for byte, with the map reported authenticated" ok \
  "$([[ "$OK2_RC" -eq 0 && "$(cat "$T/r2/ok/payload.txt")" == "payload bytes" && -f "$T/r2/ok/pg/b.dump" && "$(jq -r .file_map <<<"$OK2")" == "authenticated" ]] && echo "ok: payload.txt and pg/b.dump recovered; file_map authenticated" || echo "bad: rc=$OK2_RC $OK2")"
# (f) a bundle sealed under format /1 (no map tag) is refused, by format, before the passphrase is read
jq '.encryption.format = "eye-bundle-crypto/1" | del(.encryption.files_tag_hex)' "$CB2/MANIFEST.json" > "$CB2/V1.json"
V1="$(EYE_BACKUP_PASSPHRASE= node "$HERE/bundle-crypto.mjs" verify --bundle "$CB2" --manifest "$CB2/V1.json" 2>&1)"; V1_RC=$?
probe "a format /1 bundle (unauthenticated file map) is refused rather than opened" refused \
  "$([[ "$V1_RC" -ne 0 ]] && echo "refused: $(head -1 <<<"$V1" | sed 's/^bundle-crypto: //')" || echo "accepted")" "file map is not authenticated"

printf '\n== probes: R1 — a directory is owned by CREATING it, never by naming it (guards.sh run manifest, stand-in paths only)\n'
mkdir -p "$T/r1/pre-existing"; printf 'sentinel\n' > "$T/r1/pre-existing/SENTINEL"
mkdir -p "$T/r1/run1"; ops_run_init "$T/r1/run1/RUN.json" "probe-run-1"
probe "recording a directory by name alone is refused by the manifest API" refused \
  "$(ops_run_record dir "$T/r1/pre-existing" "build root" 2>&1 || true)" "recorded only by ops_run_create_dir"
probe "creating a pre-existing directory as a build root is refused" refused \
  "$(ops_run_create_dir "build root" "$T/r1/pre-existing" "build root")" "already exists"
probe "…and the refusal recorded nothing: the run owns no directory it could remove" ok \
  "$([[ -z "$(ops_run_owned_dirs)" ]] && echo "ok: owned set empty ($(jq -c '[.created[]|select(.kind=="dir")]|length' "$OPS_RUN_MANIFEST") dir records)" || echo "bad: $(ops_run_owned_dirs)")"
for d in $(ops_run_owned_dirs); do rm -rf "$d"; done # the exact cleanup backup.sh runs on failure
probe "…so failure cleanup leaves the pre-existing directory and its sentinel in place (the reviewer's reproduction, corrected)" ok \
  "$([[ -f "$T/r1/pre-existing/SENTINEL" ]] && echo "ok: existing_build_deleted=false sentinel_survived=true" || echo "bad: existing_build_deleted=true")"
# the real builder, told the root is pre-created, refuses one that is not empty — without writing into it
BI="$(node "$HERE/build-identity.mjs" build --repo "$REPO" --root "$T/r1/pre-existing" --root-precreated 2>&1)"; BI_RC=$?
probe "build-identity.mjs refuses a pre-created root that is not empty, and writes nothing into it" refused \
  "$([[ "$BI_RC" -ne 0 && "$(ls -A "$T/r1/pre-existing" | tr '\n' ' ')" == "SENTINEL " ]] && echo "refused: $(head -1 <<<"$BI" | sed 's/^build-identity: //')" || echo "accepted: rc=$BI_RC $(ls -A "$T/r1/pre-existing")")" "is not empty"
ln -s "$T/r1/pre-existing" "$T/r1/linked-root"
BI2="$(node "$HERE/build-identity.mjs" build --repo "$REPO" --root "$T/r1/linked-root" --root-precreated 2>&1)"; BI2_RC=$?
probe "build-identity.mjs refuses a symlinked pre-created root" refused \
  "$([[ "$BI2_RC" -ne 0 ]] && echo "refused: $(head -1 <<<"$BI2" | sed 's/^build-identity: //')" || echo "accepted")" "is a symlink"
# two attempts at one destination: the creator owns it, the loser owns nothing
V1R="$(ops_run_create_dir "build root" "$T/r1/shared" "build root")"; printf 'work\n' > "$T/r1/shared/WORK"
probe "the first attempt creates and owns the destination" created "$V1R" "inode"
mkdir -p "$T/r1/run2"; M1="$OPS_RUN_MANIFEST"; ops_run_init "$T/r1/run2/RUN.json" "probe-run-2"
probe "a concurrent second attempt at the same destination is refused and owns nothing" refused \
  "$(ops_run_create_dir "build root" "$T/r1/shared" "build root")" "already exists"
for d in $(ops_run_owned_dirs); do rm -rf "$d"; done # run 2's cleanup
probe "…and run 2's cleanup does not remove run 1's directory or its work" ok \
  "$([[ -f "$T/r1/shared/WORK" ]] && echo "ok: run 1's WORK file survives run 2's cleanup" || echo "bad")"
# the path replaced underneath run 1: a different directory at the same name is not run 1's to remove
OPS_RUN_MANIFEST="$M1"; mv "$T/r1/shared" "$T/r1/shared-moved"; mkdir "$T/r1/shared"; printf 'someone else\n' > "$T/r1/shared/OTHER"
probe "a directory replaced underneath the run (same path, different inode) is no longer in the run's owned set" ok \
  "$([[ -z "$(ops_run_owned_dirs)" ]] && echo "ok: owned set empty; recorded inode no longer at the path" || echo "bad: $(ops_run_owned_dirs)")"
for d in $(ops_run_owned_dirs); do rm -rf "$d"; done
probe "…so run 1's cleanup leaves the replacement in place" ok "$([[ -f "$T/r1/shared/OTHER" ]] && echo "ok: OTHER survives" || echo "bad")"

printf '\n== probes: the backup source override can only point AWAY from the live deployment\n'
probe "backup.sh refuses to run without EYE_BACKUP_PASSPHRASE (before anything is read or written)" refused \
  "$(EYE_BACKUP_PASSPHRASE= EYE_BACKUP_ROOT="$T/fresh" "$HERE/backup.sh" 2>&1 | grep -m1 '^backup: EYE_BACKUP_PASSPHRASE' | sed 's/^backup: /refused: /')" "is not set in the environment"
mkdir -p "$T/standin-source"
LIVE_PG_NAME="$(jq -r '.services.postgres.container_name' <<<"$CJ_REAL")"
probe "backup.sh refuses an EYE_BACKUP_SOURCE_PG_CONTAINER that docker-compose.yml declares ($LIVE_PG_NAME)" refused \
  "$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' EYE_BACKUP_ROOT="$T/fresh" \
      EYE_BACKUP_SOURCE_ROOT="$T/standin-source" EYE_BACKUP_SOURCE_PG_CONTAINER="$LIVE_PG_NAME" \
      EYE_BACKUP_SOURCE_LABEL="stand-in" "$HERE/backup.sh" 2>&1 | grep -m1 'refused:' | sed 's/^backup: //')" "may only point AWAY from the live deployment"
probe "backup.sh refuses an EYE_BACKUP_SOURCE_ROOT inside the real repository" refused \
  "$(EYE_BACKUP_PASSPHRASE='stand-in passphrase 1' EYE_BACKUP_ROOT="$T/fresh" \
      EYE_BACKUP_SOURCE_ROOT="$REPO/apps" EYE_BACKUP_SOURCE_PG_CONTAINER="eye-cp45-standin" \
      EYE_BACKUP_SOURCE_LABEL="stand-in" "$HERE/backup.sh" 2>&1 | grep -m1 '^backup: refused' | sed 's/^backup: //')" "protected path $REPO"
AFTER2="$(docker ps -aq 2>/dev/null | sort | cksum | awk '{print $1}')"
probe "still no container was created or removed by the new probes" ok \
  "$([[ "$BEFORE" == "$AFTER2" ]] && echo "ok: docker ps -aq unchanged ($AFTER2)" || echo "bad: $BEFORE -> $AFTER2")"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
