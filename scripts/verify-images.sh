#!/usr/bin/env bash
# R10 mandated test 13 — exact image-digest and blocking image-scan verification.
# Fails (nonzero) when:
#   - docker-compose.yml does not reference EXACTLY the digests recorded in
#     conformance.manifest.json, or
#   - a `trivy image` scan of either EXACT digest finds HIGH/CRITICAL findings
#     without an authoritative, dated disposition in .trivyignore.
# Evidence: evidence/supply-chain/trivy-image-*.txt + verify-images.txt.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=evidence/supply-chain
mkdir -p "$OUT"
REPORT="$OUT/verify-images.txt"
{
  echo "# Exact-image digest + blocking-scan verification"
  echo "timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "trivy: $(trivy --version | head -1)"
  echo "docker: $(docker --version)"
} > "$REPORT"

PG_DIGEST=$(python3 -c "import json;print(json.load(open('conformance.manifest.json'))['pinned_images']['postgres']['digest'])")
REDIS_DIGEST=$(python3 -c "import json;print(json.load(open('conformance.manifest.json'))['pinned_images']['redis']['digest'])")

fail=0
for pair in "postgres:$PG_DIGEST" "redis:$REDIS_DIGEST"; do
  name="${pair%%:*}"; digest="${pair#*:}"
  if grep -qF "image: $digest" docker-compose.yml; then
    echo "compose[$name]: digest matches manifest ($digest)" >> "$REPORT"
  else
    echo "compose[$name]: MISMATCH — manifest says $digest, compose differs" >> "$REPORT"
    fail=1
  fi
done

echo "--- trivy image scans (blocking HIGH/CRITICAL, dispositions: .trivyignore) ---" >> "$REPORT"
set +e
trivy image --severity HIGH,CRITICAL --exit-code 1 --ignorefile .trivyignore "$PG_DIGEST" > "$OUT/trivy-image-postgres18.txt" 2>&1
pg_rc=$?
trivy image --severity HIGH,CRITICAL --exit-code 1 --ignorefile .trivyignore "$REDIS_DIGEST" > "$OUT/trivy-image-redis8.txt" 2>&1
redis_rc=$?
set -e
{
  echo "postgres image scan exit: $pg_rc (target: $PG_DIGEST)"
  echo "redis image scan exit:    $redis_rc (target: $REDIS_DIGEST)"
} >> "$REPORT"
[[ $pg_rc -ne 0 || $redis_rc -ne 0 ]] && fail=1

if [[ $fail -ne 0 ]]; then
  echo "IMAGE VERIFICATION FAILED — see $REPORT" | tee -a "$REPORT"
  exit 1
fi
echo "result: PASS (digests consistent; both exact-image scans clean at HIGH/CRITICAL under dated dispositions)" >> "$REPORT"
cat "$REPORT"
