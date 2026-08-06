#!/usr/bin/env bash
# Gate-2 §10 / adversarial test 17 — prove that typecheck passes from a
# GENUINELY CLEAN checkout, with no pre-existing dist/, .next/ or *.tsbuildinfo
# anywhere, and in the order CI actually uses (typecheck BEFORE build).
#
# The fix under test: workspace packages expose a "development" export condition
# pointing at their TypeScript sources, and the typecheck tsconfigs opt into it
# via customConditions. Builds still consume the emitted declarations.
#
# Evidence: evidence/clean-typecheck.txt
set -uo pipefail
cd "$(dirname "$0")/.."

OUT=evidence/clean-typecheck.txt
mkdir -p evidence
{
  echo "# Clean-source typecheck verification (no stale build artifacts)"
  echo "timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "node: $(node --version)  pnpm: $(pnpm --version)  tsc: $(pnpm exec tsc --version)"
  echo "source sha: $(git rev-parse HEAD)"
  echo
} > "$OUT"

echo "==> removing every build artifact" | tee -a "$OUT"
rm -rf packages/contracts/dist packages/tokens/dist apps/api/dist apps/web/.next apps/web/.next-dev
find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete 2>/dev/null

echo "==> asserting none remain" | tee -a "$OUT"
LEFTOVER=$(find . \( -path ./node_modules -prune \) -o \
  \( -name '*.tsbuildinfo' -o -path './packages/*/dist' -o -path './apps/api/dist' -o -path './apps/web/.next' \) -print 2>/dev/null | head)
if [[ -n "$LEFTOVER" ]]; then
  echo "FAIL: build artifacts still present:" | tee -a "$OUT"
  echo "$LEFTOVER" | tee -a "$OUT"
  exit 1
fi
echo "  none present" | tee -a "$OUT"

echo "==> pnpm typecheck (CI order: typecheck BEFORE build)" | tee -a "$OUT"
pnpm typecheck >> "$OUT" 2>&1
rc=$?
echo "typecheck exit: $rc" | tee -a "$OUT"
if [[ $rc -ne 0 ]]; then
  echo "FAIL: clean-source typecheck did not pass" | tee -a "$OUT"
  exit 1
fi

echo "==> pnpm build (must still succeed after a clean typecheck)" | tee -a "$OUT"
pnpm build >> "$OUT" 2>&1
brc=$?
echo "build exit: $brc" | tee -a "$OUT"
if [[ $brc -ne 0 ]]; then
  echo "FAIL: build failed" | tee -a "$OUT"
  exit 1
fi

echo "result: PASS — clean-source typecheck and build both succeed in CI order" | tee -a "$OUT"
