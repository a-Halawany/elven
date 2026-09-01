#!/usr/bin/env bash
#
# Pin a foreign checkout to an EXACT publication SHA, and prove it before anything reads from it.
#
# This replaces `git clone --depth 1 <repo>`, which resolves to whatever the default branch is at
# that moment. Main can advance between signing and verification, and then the package would be
# checked with a different verifier, a different policy and a different anchor than the ones the
# publication was made under - after the irreversible Rekor write, so the failure would be
# unrecoverable and would not even be about the evidence.
#
# Usage: c19-foreign-checkout.sh <remote-url> <sha> <dir>
#
# On success the directory is detached at exactly <sha> and that is asserted here, immediately
# before the caller verifies. It prints nothing a caller has to parse: it either exits 0 with the
# checkout pinned, or it fails.
set -euo pipefail

REMOTE="${1:?a remote url is required}"
SHA="${2:?the exact publication SHA is required}"
DIR="${3:?a target directory is required}"

# A branch name or an abbreviation would defeat the purpose: both can resolve to more than one
# commit over time, and the value is meant to name exactly one forever.
if ! printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "::error::'$SHA' is not a full 40-character commit SHA; a moving or abbreviated reference" \
       "must not decide which source verifies a publication"
  exit 1
fi

rm -rf "$DIR"
git init --quiet "$DIR"
git -C "$DIR" remote add origin "$REMOTE"
# Fetch the commit ITSELF, not a branch that currently points at it.
git -C "$DIR" fetch --quiet --depth 1 origin "$SHA"
git -C "$DIR" -c advice.detachedHead=false checkout --quiet --detach "$SHA"

HEAD_NOW="$(git -C "$DIR" rev-parse HEAD)"
if [ "$HEAD_NOW" != "$SHA" ]; then
  echo "::error::foreign checkout is at $HEAD_NOW, not the publication SHA $SHA; refusing before" \
       "verification rather than verifying against source nobody reviewed"
  exit 1
fi
echo "c19-foreign-checkout: $DIR pinned at $HEAD_NOW"
