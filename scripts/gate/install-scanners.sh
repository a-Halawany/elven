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

install_tool() {
  local tool url want_archive want_binary got_archive got_binary work
  tool="$1"
  url="$(field "$tool" url)"
  want_archive="$(field "$tool" sha256)"
  want_binary="$(field "$tool" executable_sha256)"

  work="$(mktemp -d)"
  echo "$tool ($PLATFORM) <- $url"
  curl -fsSL --retry 3 -o "$work/archive.tar.gz" "$url"

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
