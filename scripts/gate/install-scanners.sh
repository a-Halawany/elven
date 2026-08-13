#!/usr/bin/env bash
# Install the PINNED scanner binaries, authenticated against the tracked upstream
# checksums in scripts/gate/scanner-pins.json.
#
# Single source of truth for both CI jobs. `build-test` needs them because the C15
# BEHAVIOURAL controls under `pnpm test` spawn the real runner, and `supply-chain` needs
# them because it runs the gate itself. Duplicating this shell inline in two jobs is how
# the two drift apart.
#
# TWO digests are verified, not one:
#   1. the release ARCHIVE, against the upstream published checksum;
#   2. the EXTRACTED EXECUTABLE, against the tracked executable digest.
# A --version string is a claim a binary makes about itself, so it is not authentication.
# The runner independently re-verifies the executable it resolves on PATH before scanning.
set -euo pipefail

PINS="${PINS:-scripts/gate/scanner-pins.json}"
DEST="${DEST:-/usr/local/bin}"

# Resolve the host platform key the pins are indexed by.
detect_platform() {
  local os arch
  os="$(uname -s)"; arch="$(uname -m)"
  case "$os/$arch" in
    Linux/x86_64)  echo linux-x64 ;;
    Linux/aarch64) echo linux-arm64 ;;
    Darwin/arm64)  echo darwin-arm64 ;;
    *) echo "::error::unsupported host platform $os/$arch — add it to scanner-pins.json"; exit 1 ;;
  esac
}
PLATFORM="${PLATFORM:-$(detect_platform)}"

field() {
  python3 -c "import json,sys;a=json.load(open(sys.argv[1]))['tools'][sys.argv[2]]['artifacts'][sys.argv[3]];print(a[sys.argv[4]])" \
    "$PINS" "$1" "$PLATFORM" "$2"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# ── ONE ABSOLUTE WALL-CLOCK DEADLINE ──────────────────────────────────────────────
# The previous comment claimed "roughly five and a half minutes". That was FALSE.
# `curl --max-time` bounds a single transfer attempt, and curl's own `--retry 3` starts a
# fresh one, so each outer attempt could take ~4×600s; six outer attempts plus backoff put
# the theoretical ceiling in the region of four hours, not five and a half minutes. A bound
# that is only true when nothing goes wrong is not a bound.
#
# The real bound is now a single absolute deadline computed once, before the first attempt.
# Every inner curl gets `--max-time` set to the time REMAINING, so no attempt — retried or
# not — can run past it, and the loop stops as soon as the deadline passes. CI additionally
# caps the step with `timeout-minutes` as a backstop in case this script is bypassed.
#
# Injection points exist so a behavioural control can drive this with a fake failing
# downloader and a fake clock instead of waiting in real time:
#   EYE_SCANNER_FETCH_CMD  <output-path> <url> <max-seconds>   (default: curl)
#   EYE_SCANNER_NOW_CMD                                        (default: date +%s)
#   EYE_SCANNER_SLEEP_CMD  <seconds>                           (default: sleep)
ACQUIRE_DEADLINE_SECONDS="${EYE_SCANNER_ACQUIRE_DEADLINE_SECONDS:-600}"
MAX_ATTEMPTS="${EYE_SCANNER_MAX_ATTEMPTS:-6}"

now_seconds() {
  if [ -n "${EYE_SCANNER_NOW_CMD:-}" ]; then "$EYE_SCANNER_NOW_CMD"; else date +%s; fi
}
do_sleep() {
  if [ -n "${EYE_SCANNER_SLEEP_CMD:-}" ]; then "$EYE_SCANNER_SLEEP_CMD" "$1"; else sleep "$1"; fi
}
do_fetch() {
  local out="$1" url="$2" max="$3"
  if [ -n "${EYE_SCANNER_FETCH_CMD:-}" ]; then
    "$EYE_SCANNER_FETCH_CMD" "$out" "$url" "$max"
  else
    # --retry covers transient HTTP/connection errors within one attempt; --max-time is the
    # REMAINING budget, so curl's internal retries cannot outlive the deadline either.
    curl -fsSL --retry 3 --retry-all-errors --retry-delay 2 --connect-timeout 20 \
         --max-time "$max" -o "$out" "$url"
  fi
}

fetch_with_deadline() {
  local tool="$1" url="$2" out="$3"
  local start deadline attempt=0 delay=10 remaining
  start="$(now_seconds)"
  deadline=$((start + ACQUIRE_DEADLINE_SECONDS))
  echo "  acquisition deadline: ${ACQUIRE_DEADLINE_SECONDS}s absolute (all attempts, all inner retries)"

  while true; do
    remaining=$(( deadline - $(now_seconds) ))
    if [ "$remaining" -le 0 ]; then
      echo "::error::${tool} download exceeded the ${ACQUIRE_DEADLINE_SECONDS}s absolute acquisition deadline after ${attempt} attempt(s): $url"
      exit 1
    fi
    if do_fetch "$out" "$url" "$remaining"; then
      return 0
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      echo "::error::${tool} download failed after $attempt whole-transfer attempts: $url"
      exit 1
    fi
    # Never sleep past the deadline — that would spend the budget doing nothing.
    remaining=$(( deadline - $(now_seconds) ))
    if [ "$remaining" -le 0 ]; then
      echo "::error::${tool} download exceeded the ${ACQUIRE_DEADLINE_SECONDS}s absolute acquisition deadline after ${attempt} attempt(s): $url"
      exit 1
    fi
    if [ "$delay" -gt "$remaining" ]; then delay="$remaining"; fi
    echo "  download attempt $attempt failed; retrying in ${delay}s (${remaining}s of budget left)"
    do_sleep "$delay"
    delay=$((delay * 2))
  done
}

install_tool() {
  local tool url want_archive want_binary got_archive got_binary work
  tool="$1"
  url="$(field "$tool" url)"
  want_archive="$(field "$tool" sha256)"
  want_binary="$(field "$tool" executable_sha256)"

  work="$(mktemp -d)"
  echo "$tool ($PLATFORM) <- $url"
  fetch_with_deadline "$tool" "$url" "$work/archive.tar.gz"

  got_archive="$(sha256_of "$work/archive.tar.gz")"
  if [ "$got_archive" != "$want_archive" ]; then
    echo "::error::${tool} ARCHIVE digest ${got_archive} does not match the tracked ${want_archive}"
    exit 1
  fi
  echo "  archive digest verified:    $got_archive"

  tar -xzf "$work/archive.tar.gz" -C "$work" "$tool"
  got_binary="$(sha256_of "$work/$tool")"
  if [ "$got_binary" != "$want_binary" ]; then
    echo "::error::${tool} EXECUTABLE digest ${got_binary} does not match the tracked ${want_binary}"
    exit 1
  fi
  echo "  executable digest verified: $got_binary"

  # sudo only when the destination is not writable, so this works in a container too.
  if [ -w "$DEST" ]; then
    install -m 0755 "$work/$tool" "$DEST/$tool"
  else
    sudo install -m 0755 "$work/$tool" "$DEST/$tool"
  fi
  rm -rf "$work"
}

for tool in "${@:-gitleaks trivy}"; do
  install_tool "$tool"
done
