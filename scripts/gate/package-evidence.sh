#!/usr/bin/env bash
# Package the final C15 + C16 gate evidence as ONE inspectable ZIP with a per-file
# SHA-256 manifest, so an unsigned public reviewer can download it and verify the exact
# bytes they received.
#
# This lives in a tracked script rather than inline in the workflow for the same reason
# `install-scanners.sh` does: shell that only ever runs on a hosted runner cannot be
# exercised by a behavioural control, and the one defect this file exists to fix — a
# SHA256SUMS.txt that recorded the digest of its own empty self and therefore reported
# FAILED on every download — was invisible to any assertion made by reading the YAML.
#
# Usage: package-evidence.sh <c15-dir> <c16-dir> <source-sha> <dest-dir>
# Prints the absolute ZIP path on the first line and its SHA-256 on the second.

set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <c15-dir> <c16-dir> <source-sha> <dest-dir>" >&2
  exit 2
fi

C15_DIR="$1"
C16_DIR="$2"
SOURCE_SHA="$3"
DEST_DIR="$4"

case "$SOURCE_SHA" in
  *[!0-9a-f]* | "")
    echo "source SHA must be lowercase hex, got '$SOURCE_SHA'" >&2; exit 2 ;;
esac
if [ "${#SOURCE_SHA}" -ne 40 ]; then
  echo "source SHA must be 40 characters, got ${#SOURCE_SHA}" >&2; exit 2
fi

# sha256sum on Linux runners, shasum -a 256 on macOS. Resolved once so the manifest and
# its verification can never disagree about which tool produced the digests.
if command -v sha256sum >/dev/null 2>&1; then
  digest_of() { sha256sum "$1" | cut -d' ' -f1; }
  verify_manifest() { sha256sum -c --quiet SHA256SUMS.txt; }
else
  digest_of() { shasum -a 256 "$1" | cut -d' ' -f1; }
  verify_manifest() { shasum -a 256 -c SHA256SUMS.txt >/dev/null; }
fi

mkdir -p "$DEST_DIR"
DEST_DIR="$(cd "$DEST_DIR" && pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BUNDLE="$WORK/bundle"
mkdir -p "$BUNDLE/c15" "$BUNDLE/c16"

# The isolated trivy cache and the staged scanner binaries are excluded by design: the
# cache is bound by its byte-level fingerprint in the manifest and the binaries by their
# authenticated digests, and both are far too large to ship.
if [ -d "$C15_DIR" ]; then
  rsync -a --exclude '.trivy-cache' --exclude '.staged-scanners' "$C15_DIR/" "$BUNDLE/c15/"
fi
if [ -d "$C16_DIR" ]; then
  rsync -a "$C16_DIR/" "$BUNDLE/c16/"
fi

# The manifest is built OUTSIDE the bundle and moved in. Redirecting straight into the
# bundle creates an empty SHA256SUMS.txt BEFORE `find` runs, so `find` lists it and the
# manifest records the digest of its own empty self — after which `sha256sum -c` reports
# `SHA256SUMS.txt: FAILED` for every reviewer who checks it. A manifest that always fails
# is indistinguishable from corrupted evidence, so it lists every file except itself.
( cd "$BUNDLE" && find . -type f ! -name SHA256SUMS.txt | sort \
    | while IFS= read -r f; do printf '%s  %s\n' "$(digest_of "$f")" "$f"; done ) \
  > "$WORK/SHA256SUMS.txt"
mv "$WORK/SHA256SUMS.txt" "$BUNDLE/SHA256SUMS.txt"

# Refuse to publish evidence whose own manifest does not verify.
( cd "$BUNDLE" && verify_manifest )

ZIP="$DEST_DIR/c16-r31-final-evidence-${SOURCE_SHA}.zip"
rm -f "$ZIP"
( cd "$BUNDLE" && zip -qr "$ZIP" . )

printf '%s\n' "$ZIP"
digest_of "$ZIP"
