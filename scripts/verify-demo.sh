#!/usr/bin/env bash
# R10 mandated test 12 — VIRGIN ./scripts/demo.sh produces a usable login flow.
# Wipes the Compose volumes, removes the local secret handoff, runs the demo
# end-to-end (which bootstraps, force-rotates via the acceptance suite, and
# leaves the API+web running), then proves a usable login: platform-admin +
# the rotated handoff password → 201 with tokens; wrong password → 401.
# Transcript: evidence/demo-virgin-transcript.txt
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=evidence/demo-virgin-transcript.txt
{
  echo "# Virgin demo.sh login-flow verification"
  echo "timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "node: $(node --version)  pnpm: $(pnpm --version)  docker: $(docker --version)"
} > "$OUT"

echo "==> wiping volumes + local secret handoff (VIRGIN run)" | tee -a "$OUT"
pkill -f "dist/main.js" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
# Old env is sourced ONLY inside this subshell (compose interpolation needs the
# variables to tear down) — it must never leak into the virgin demo run.
( set -a; [ -f .eye-local/env ] && source .eye-local/env; set +a
  docker compose down -v --remove-orphans ) >> "$OUT" 2>&1 || true
rm -rf .eye-local

echo "==> running ./scripts/demo.sh (full transcript captured)" | tee -a "$OUT"
./scripts/demo.sh >> "$OUT" 2>&1
demo_rc=$?
echo "demo.sh exit: $demo_rc" | tee -a "$OUT"

echo "==> login-flow proof against the running API" | tee -a "$OUT"
ADMIN_PW=$(grep '^EYE_TEST_ADMIN_PASSWORD=' .eye-local/env | cut -d= -f2)
login() {
  node - "$1" << 'EOF'
const password = process.argv[2];
const { createHash, randomUUID } = require('crypto');
const jcs = (v) => v === null ? 'null'
  : Array.isArray(v) ? '[' + v.map(jcs).join(',') + ']'
  : typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}'
  : JSON.stringify(v);
const payload = { username: 'platform-admin', password };
const envelope = {
  message_id: randomUUID(), scope: 'PLATFORM', tenant_id: null, domain_id: null,
  principal_id: 'anonymous', purpose_id: 'authentication', action: 'identity.login',
  side_effect_class: 'reversible', consequence_class: 'C1', object_type: 'SES',
  schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
  correlation_id: randomUUID(), trace_id: 'verify-demo',
  payload_digest: createHash('sha256').update(jcs(payload), 'utf8').digest('hex'),
};
fetch('http://localhost:3401/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ envelope, payload }),
}).then(async (r) => {
  const b = await r.json();
  console.log(`status=${r.status} rotationRequired=${b.rotationRequired ?? 'n/a'} hasTokens=${!!b.tokens}`);
  process.exit(0);
});
EOF
}

GOOD=$(login "$ADMIN_PW")
echo "rotated-credential login: $GOOD" | tee -a "$OUT"
BAD=$(login "definitely-wrong-password-123")
echo "wrong-credential login:   $BAD" | tee -a "$OUT"

if [[ "$GOOD" != *"status=201"* || "$GOOD" != *"hasTokens=true"* ]]; then
  echo "FAIL: rotated credential did not produce a usable session" | tee -a "$OUT"; exit 1
fi
if [[ "$BAD" != *"status=401"* ]]; then
  echo "FAIL: wrong credential was not rejected" | tee -a "$OUT"; exit 1
fi
echo "result: PASS — virgin demo produces a usable, governed login flow" | tee -a "$OUT"
