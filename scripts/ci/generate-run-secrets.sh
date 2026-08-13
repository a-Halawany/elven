#!/usr/bin/env bash
# Generate this run's ephemeral credentials, MASK them, then export them.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────
# The workflow previously generated these values inline and appended them straight to
# $GITHUB_ENV. The runner echoes an `env:` group before every `run:` step, so every one of
# them appeared in PLAINTEXT in the public Actions log — thirteen credentials per run,
# repeated once per subsequent step. They are ephemeral and die with the runner and its
# database, so nothing durable was exposed, but a public log must not carry them.
#
# `::add-mask::` is emitted for each value BEFORE the value is written anywhere the runner
# will echo it. Once registered, the runner redacts that exact string everywhere it appears
# for the remainder of the job, including the `env:` groups.
#
# One tracked script rather than two inline copies: both database jobs need the identical
# set, and two inline copies are how two copies drift apart.
#
# Usage: generate-run-secrets.sh            # appends to $GITHUB_ENV
#        GITHUB_ENV=/path generate-run-secrets.sh
#
# Testability: set EYE_SECRET_GEN_CMD to a command printing one value per invocation. The
# behavioural control uses it to make the generated values predictable so it can prove they
# were masked; production leaves it unset and uses `openssl rand`.
set -euo pipefail

: "${GITHUB_ENV:?GITHUB_ENV must point at the file to append exports to}"

# The exact set both database jobs require. Adding a credential here without adding it to
# the workflow is harmless; using one in the workflow without listing it here fails the job
# with an unbound variable, which is the direction that fails safe.
SECRET_NAMES=(
  EYE_DB_PASSWORD
  EYE_DB_APP_PASSWORD
  EYE_DB_ALLOCATOR_PASSWORD
  EYE_DB_SYSTEM_PASSWORD
  EYE_DB_COMMIT_PASSWORD
  EYE_DB_IDENTITY_PASSWORD
  EYE_DB_PUBLISHER_PASSWORD
  EYE_DB_VERIFIER_PASSWORD
  EYE_DB_RECOVERY_PASSWORD
  EYE_TEST_BOOTSTRAP_PASSWORD
  EYE_TEST_ADMIN_PASSWORD
  EYE_REDIS_PASSWORD
)
# The JWT secret is deliberately longer than a password.
LONG_SECRET_NAMES=(EYE_IDENTITY_JWT_SECRET)

gen() {
  local bytes="$1"
  if [ -n "${EYE_SECRET_GEN_CMD:-}" ]; then
    "$EYE_SECRET_GEN_CMD" "$bytes"
  else
    openssl rand -hex "$bytes"
  fi
}

emit() {
  local name="$1" value="$2"
  # MASK FIRST. The order is the whole point: a value written to $GITHUB_ENV before being
  # registered is echoed in plaintext by the next step's env group.
  echo "::add-mask::${value}"
  printf '%s=%s\n' "$name" "$value" >> "$GITHUB_ENV"
}

for name in "${SECRET_NAMES[@]}"; do
  emit "$name" "$(gen 24)"
done
for name in "${LONG_SECRET_NAMES[@]}"; do
  emit "$name" "$(gen 48)"
done

# Count only — never the values.
echo "generated and masked ${#SECRET_NAMES[@]} credential(s) and ${#LONG_SECRET_NAMES[@]} long secret(s)"
