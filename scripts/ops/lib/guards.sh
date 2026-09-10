#!/usr/bin/env bash
# The Eye — destination guards shared by scripts/ops/backup.sh, restore.sh and
# test-guards.sh (delivery package R0/P7-D). Sourced, never executed.
#
# Every function here reasons about PHYSICAL paths: symlinks are resolved with
# `cd -P && pwd -P`, which exists on macOS (bash 3.2) and Linux alike, so a
# destination that is textually outside the repository but physically inside it
# (an outside symlink pointing in) is refused, and a destination equal to or
# above a protected path is refused. No GNU-only tool is used.
#
# Nothing in this file prints a secret, creates a container, or touches a path
# other than the one destination it is asked to create (ops_mkdir_fresh).

# ops_phys <path>
#   Physical canonical path of <path>, which need not exist: the nearest existing
#   ancestor is resolved physically and the remaining components are appended.
ops_phys() {
  local p="$1" rest="" phys
  [[ -n "$p" ]] || return 1
  case "$p" in /*) ;; *) p="$PWD/$p";; esac
  while [[ "$p" != "/" && "$p" == */ ]]; do p="${p%/}"; done
  local hops=0 tgt
  while [[ ! -d "$p" ]]; do
    [[ "$p" != "/" ]] || return 1
    if [[ -L "$p" ]]; then   # a dangling symlink component: follow it, so that its physical intent is what is judged
      hops=$((hops+1)); [[ "$hops" -le 64 ]] || return 1
      tgt="$(readlink "$p")"; case "$tgt" in /*) p="$tgt";; *) p="$(dirname "$p")/$tgt";; esac
      while [[ "$p" != "/" && "$p" == */ ]]; do p="${p%/}"; done
      continue
    fi
    rest="/$(basename "$p")$rest"
    p="$(dirname "$p")"
  done
  phys="$(cd -P "$p" 2>/dev/null && pwd -P)" || return 1
  [[ "$phys" != "/" ]] || phys=""
  if [[ -z "$phys$rest" ]]; then printf '/\n'; else printf '%s\n' "$phys$rest"; fi
}

# ops_symlink_free <path>
#   Succeeds when neither <path> nor any ancestor between it and its nearest
#   pre-existing directory (inclusive) is a symlink. Prints the offending path.
ops_symlink_free() {
  local p="$1"
  case "$p" in /*) ;; *) p="$PWD/$p";; esac
  while [[ "$p" != "/" && "$p" == */ ]]; do p="${p%/}"; done
  while [[ "$p" != "/" ]]; do
    if [[ -L "$p" ]]; then printf '%s is a symlink\n' "$p"; return 1; fi
    [[ ! -e "$p" ]] || return 0
    p="$(dirname "$p")"
  done
  return 0
}

# ops_related <a> <b>   (both physical)
#   0 when a equals b, a is inside b, or a is an ancestor of b.
ops_related() {
  local a="$1" b="$2"
  [[ "$a" != "$b" ]] || return 0
  [[ "$a" != "/" && "$b" != "/" ]] || return 0
  case "$a/" in "$b/"*) return 0;; esac
  case "$b/" in "$a/"*) return 0;; esac
  return 1
}

# ops_protected_paths <repo>
#   One physical path per line: the repository worktree, its git common dir
#   (a worktree's .git lives elsewhere), .eye-local and apps/api/.eye-local
#   (resolved through any symlink), and every bind-mount host path named by
#   docker-compose.yml (parsed by service structure, see compose-services.mjs).
ops_protected_paths() {
  local repo="$1" p common lib
  lib="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  ops_phys "$repo"
  common="$(git -C "$repo" rev-parse --git-common-dir 2>/dev/null || true)"
  case "$common" in "") ;; /*) ops_phys "$common";; *) ops_phys "$repo/$common";; esac
  for p in "$repo/.eye-local" "$repo/apps/api/.eye-local"; do
    ops_phys "$p"
    # a symlinked .eye-local (the 2026-09-09 incident shape): protect its target as well
    if [[ -L "$p" ]]; then ops_phys "$(cd -P "$p" 2>/dev/null && pwd -P || readlink "$p")"; fi
  done
  if [[ -f "$repo/docker-compose.yml" ]] && command -v node >/dev/null; then
    node "$lib/../compose-services.mjs" "$repo/docker-compose.yml" 2>/dev/null \
      | jq -r '.bind_mounts[]?' 2>/dev/null | while IFS= read -r p; do [[ -z "$p" ]] || ops_phys "$p"; done
  fi
}

# ops_guard_destination <label> <path> <protected-physical-path>...
#   Prints one verdict line ("accepted: …" or "refused: …"); returns 1 on refusal.
#   Refuses: unresolvable paths; a symlinked destination or symlinked ancestor;
#   a physical path equal to, inside, or an ancestor of any protected path.
ops_guard_destination() {
  local label="$1" path="$2" phys why f
  shift 2
  phys="$(ops_phys "$path")" || { printf 'refused: %s %s cannot be resolved to a physical path\n' "$label" "$path"; return 1; }
  for f in "$@"; do
    [[ -n "$f" ]] || continue
    if ops_related "$phys" "$f"; then
      printf 'refused: %s %s (physical %s) is inside, equal to, or an ancestor of the protected path %s\n' "$label" "$path" "$phys" "$f"; return 1
    fi
  done
  if ! why="$(ops_symlink_free "$path")"; then
    printf 'refused: %s %s: %s (symlinked destinations and symlinked ancestors are not accepted)\n' "$label" "$path" "$why"; return 1
  fi
  printf 'accepted: %s %s (physical %s)\n' "$label" "$path" "$phys"
}

# ops_require_existing_dir <label> <path>
#   The path must already exist, be a directory and not be a symlink.
ops_require_existing_dir() {
  local label="$1" path="$2"
  if [[ -L "$path" ]]; then printf 'refused: %s %s is a symlink\n' "$label" "$path"; return 1; fi
  if [[ ! -e "$path" ]]; then printf 'refused: %s %s does not exist (create it first: mkdir -m 700 %s)\n' "$label" "$path" "$path"; return 1; fi
  if [[ ! -d "$path" ]]; then printf 'refused: %s %s is not a directory\n' "$label" "$path"; return 1; fi
  printf 'ok: %s %s exists, is a directory and is not a symlink\n' "$label" "$path"
}

# ops_mkdir_fresh <label> <path>
#   Creates <path> with a plain mkdir (no -p): its parent must exist and the
#   path itself must not exist in any form (file, dir, dangling symlink).
ops_mkdir_fresh() {
  local label="$1" path="$2"
  if [[ -e "$path" || -L "$path" ]]; then printf 'refused: %s %s already exists (a fresh destination is required)\n' "$label" "$path"; return 1; fi
  if ! mkdir "$path" 2>/dev/null; then printf 'refused: %s %s could not be created (parent missing or not writable)\n' "$label" "$path"; return 1; fi
  printf 'created: %s %s\n' "$label" "$path"
}

# ---------------------------------------------------------------- run manifest
# Every container, volume, directory or process a run creates is recorded here
# as it is created; cleanup removes ONLY recorded resources, never a name pattern.
# ops_run_init <file> <script>
ops_run_init() {
  OPS_RUN_MANIFEST="$1"
  jq -n --arg s "$2" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg pid "$$" \
    '{format:"eye-ops-run/1", script:$s, started_at_utc:$t, pid:($pid|tonumber), created:[]}' > "$OPS_RUN_MANIFEST"
  chmod 600 "$OPS_RUN_MANIFEST"
}
# ops_run_record <kind: dir|container|volume|process> <id> [detail]
ops_run_record() {
  local tmp="$OPS_RUN_MANIFEST.tmp"
  jq --arg k "$1" --arg i "$2" --arg d "${3:-}" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '.created += [{kind:$k, id:$i, detail:$d, at:$t}]' "$OPS_RUN_MANIFEST" > "$tmp" && chmod 600 "$tmp" && mv "$tmp" "$OPS_RUN_MANIFEST"
}
# ops_run_ids <kind>  -> the recorded ids of that kind, one per line
ops_run_ids() { jq -r --arg k "$1" '.created[] | select(.kind==$k) | .id' "$OPS_RUN_MANIFEST"; }

# ---------------------------------------------------------------- portability
ops_mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"; }
ops_sha256() { if command -v shasum >/dev/null; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }
