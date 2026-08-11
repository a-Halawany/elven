#!/usr/bin/env bash
# Install the PINNED scanner binaries, authenticated against the tracked upstream
# checksums in scripts/gate/scanner-pins.json.
#
# Single source of truth for both CI jobs. `build-test` needs them because the C15
# BEHAVIOURAL controls under `pnpm test` spawn the real runner, and `supply-chain` needs
# them because it runs the gate itself. Duplicating this shell inline in two jobs is how
# the two drift apart.
#
# An unauthenticated download is an unverified input to the gate that exists to verify
# inputs, so a digest mismatch is fatal.
set -euo pipefail

PINS="${PINS:-scripts/gate/scanner-pins.json}"
DEST="${DEST:-/usr/local/bin}"
PLATFORM="${PLATFORM:-linux-x64}"

field() {
  python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['tools'][sys.argv[2]]['artifacts'][sys.argv[3]][sys.argv[4]])" \
    "$PINS" "$1" "$PLATFORM" "$2"
}

install_tool() {
  tool="$1"
  url="$(field "$tool" url)"
  want="$(field "$tool" sha256)"
  echo "$tool <- $url"
  curl -fsSL --retry 3 -o "/tmp/${tool}.tar.gz" "$url"
  got="$(sha256sum "/tmp/${tool}.tar.gz" | cut -d' ' -f1)"
  if [ "$got" != "$want" ]; then
    echo "::error::${tool} download digest ${got} does not match the tracked ${want}"
    exit 1
  fi
  echo "${tool} digest verified: ${got}"
  sudo tar -xzf "/tmp/${tool}.tar.gz" -C "$DEST" "$tool"
  sudo chmod +x "${DEST}/${tool}"
}

for tool in "${@:-gitleaks trivy}"; do
  install_tool "$tool"
done
