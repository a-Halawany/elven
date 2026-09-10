#!/usr/bin/env bash
# The Eye — runtime-state restore (delivery package R0/P7-D). Companion of backup.sh;
# procedure and guarantees in docs/ops/BACKUP_RESTORE.md.
#
#   restore.sh <bundle>                   validate the bundle (every sha256 against MANIFEST.json)
#                                         and print the in-place procedure; touches nothing else
#   restore.sh <bundle> --into-isolated   restore into an ISOLATED environment and VERIFY coherence:
#                                           eye-restore-pg     postgres from the SAME pinned digest as docker-compose.yml,
#                                                              new volume eye-restore-pgdata, host port 127.0.0.1:55433
#                                           eye-restore-redis  redis from the pinned digest, host port 127.0.0.1:56379 (empty:
#                                                              the runbook's claim that Redis is rebuilt from the database)
#                                           ${EYE_RESTORE_ROOT:-$HOME/eye-restore/<ts>}  vault, journal and config copy
#                                           a second API from apps/api/dist/main.js on :3402 against the restored eye_demo,
#                                           scheduler DISABLED, /readyz and one governed read proved
#                                         then tears every eye-restore-* resource down (unless --keep)
#   --keep                                leave the isolated environment running for inspection
#
# THE LIVE DEPLOYMENT IS NEVER TOUCHED: this script never names eye-postgres, eye-redis,
# their volumes, .eye-local/ or apps/api/.eye-local/ in any command; every resource it creates
# is prefixed eye-restore-. It refuses a restore root inside the repository.
#
# NO SECRET IS EVER PRINTED. config/env is loaded with `set -a; . env; set +a` and its values
# travel only as process environment (PGPASSWORD, POSTGRES_PASSWORD, REDIS_PASSWORD, the API's
# own configuration). Do not add `set -x`.
set -euo pipefail
set +x
umask 077

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PG_NAME="eye-restore-pg"; PG_VOLUME="eye-restore-pgdata"; PG_PORT="${EYE_RESTORE_PG_PORT:-55433}"
REDIS_NAME="eye-restore-redis"; REDIS_PORT="${EYE_RESTORE_REDIS_PORT:-56379}"
API_PORT="${EYE_RESTORE_API_PORT:-3402}"
API_DB="eye_demo"
PG_SUPERUSER="eye"
STRICT_BLOB_DBS="${EYE_RESTORE_STRICT_BLOB_DBS:-eye_demo}"   # databases whose vault bytes must ALL be present

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'restore: %s\n' "$*" >&2; exit 1; }
now_s() { date -u +%s; }
sha()  { shasum -a 256 "$1" | awk '{print $1}'; }
PASS=0; FAIL=0
check() { # check <ok:true|false> <label>
  if [[ "$1" == "true" ]]; then PASS=$((PASS+1)); say "  PASS  $2"; else FAIL=$((FAIL+1)); say "  FAIL  $2"; fi
}

# ------------------------------------------------------------------ args
BUNDLE=""; ISOLATED=false; KEEP=false
for a in "$@"; do
  case "$a" in
    --into-isolated) ISOLATED=true;;
    --keep) KEEP=true;;
    -h|--help) sed -n '2,25p' "$0"; exit 0;;
    *) [[ -z "$BUNDLE" ]] || die "unexpected argument: $a"; BUNDLE="$a";;
  esac
done
[[ -n "$BUNDLE" ]] || die "usage: restore.sh <bundle> [--into-isolated] [--keep]"
BUNDLE="$(cd "$BUNDLE" && pwd)"
MANIFEST="$BUNDLE/MANIFEST.json"
[[ -f "$MANIFEST" ]] || die "$MANIFEST is missing"
command -v docker >/dev/null || die "docker is required"
command -v jq >/dev/null || die "jq is required"
command -v node >/dev/null || die "node is required"
[[ "$(jq -r .format "$MANIFEST")" == "eye-backup-bundle/1" ]] || die "unknown bundle format"

# --------------------------------------------------- bundle validation
step "bundle $BUNDLE (created $(jq -r .bundle.created_at_utc "$MANIFEST"), git $(jq -r .bundle.git_head "$MANIFEST" | cut -c1-12))"
ALL_OK=true
for f in $(jq -r '.files | keys[]' "$MANIFEST"); do
  want="$(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")"
  if [[ -f "$BUNDLE/$f" ]] && [[ "$(sha "$BUNDLE/$f")" == "$want" ]]; then say "  ok   $f  $want"; else say "  BAD  $f"; ALL_OK=false; fi
done
[[ "$ALL_OK" == "true" ]] || die "bundle integrity check failed"
say "  every file matches MANIFEST.json"

if [[ "$ISOLATED" != "true" ]]; then
  cat <<EOF

The bundle is intact. This script restores ONLY into an isolated environment
(--into-isolated). Restoring IN PLACE over the live deployment is a governed
recovery: follow docs/ops/BACKUP_RESTORE.md §7 (stop the API, restore
pg/globals.sql then the dumps into a fresh eye-pgdata volume, extract vault.tar
and journal.tar at the repository root, place config/env at .eye-local/env with
mode 0600, rebuild the audit heads through audit.rebuild_chain_heads() only
after the chain verification below has passed, then start the API so the
schedulers are reconciled from the database).
EOF
  exit 0
fi

# ------------------------------------------------- isolation preflight
step "isolation preflight"
RROOT_BASE="${EYE_RESTORE_ROOT:-$HOME/eye-restore/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$RROOT_BASE"; RROOT="$(cd "$RROOT_BASE" && pwd)"
case "$RROOT/" in "$REPO/"*) die "EYE_RESTORE_ROOT must be outside the repository ($RROOT)";; esac
chmod 700 "$RROOT"
for n in "$PG_NAME" "$REDIS_NAME"; do
  ! docker ps -a --format '{{.Names}}' | grep -qx "$n" || die "$n already exists; remove it (docker rm -f $n) or use --keep from a previous run deliberately"
done
! docker volume ls --format '{{.Name}}' | grep -qx "$PG_VOLUME" || die "volume $PG_VOLUME already exists; docker volume rm $PG_VOLUME"
for p in "$PG_PORT" "$REDIS_PORT" "$API_PORT"; do
  ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || die "port $p is in use"
done
[[ -f "$REPO/apps/api/dist/main.js" ]] || die "apps/api/dist/main.js is missing (build output is required to start the second API)"
PG_DIGEST="$(jq -r .images.postgres.compose_pin "$MANIFEST")"
REDIS_DIGEST="$(jq -r .images.redis.compose_pin "$MANIFEST")"
[[ "$(jq -r .images.postgres.pin_matches "$MANIFEST")" == "true" ]] || die "the manifest's postgres image does not match the compose pin"
COMPOSE_PG="$(grep -E '^[[:space:]]*image:[[:space:]]*postgres@' "$REPO/docker-compose.yml" | sed -E 's/^[[:space:]]*image:[[:space:]]*([^ ]+).*/\1/' | head -1)"
[[ "$COMPOSE_PG" == "$PG_DIGEST" ]] || die "docker-compose.yml pins $COMPOSE_PG but the bundle was taken from $PG_DIGEST"
docker image inspect "$PG_DIGEST" >/dev/null 2>&1 || die "$PG_DIGEST is not present locally (no pull is attempted by this script)"
docker image inspect "$REDIS_DIGEST" >/dev/null 2>&1 || die "$REDIS_DIGEST is not present locally"
say "  restore root: $RROOT"
say "  postgres: $PG_DIGEST"
say "  redis:    $REDIS_DIGEST"
say "  resources: $PG_NAME (:$PG_PORT, volume $PG_VOLUME), $REDIS_NAME (:$REDIS_PORT), API :$API_PORT"

API_PID=""
teardown() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi
  if [[ "$KEEP" == "true" ]]; then
    say "  --keep: $PG_NAME, $REDIS_NAME, volume $PG_VOLUME and $RROOT are left in place"
    return
  fi
  docker rm -f "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
  docker volume rm "$PG_VOLUME" >/dev/null 2>&1 || true
  say "  removed $PG_NAME, $REDIS_NAME, volume $PG_VOLUME (restore root $RROOT and the bundle are kept)"
}
trap 'rc=$?; step "teardown"; teardown; exit $rc' EXIT

# ------------------------------------------------------- config copy
step "config/env -> $RROOT/config/env (0600)"
mkdir -p "$RROOT/config" "$RROOT/work"
cp "$BUNDLE/config/env" "$RROOT/config/env"; chmod 600 "$RROOT/config/env"
set -a
# shellcheck disable=SC1090
. "$RROOT/config/env"
set +a
export PGPASSWORD="$EYE_DB_PASSWORD"
say "  keys=$(grep -c '^[A-Z0-9_]*=' "$RROOT/config/env") (values never displayed)"

T0=$(now_s)
# ---------------------------------------------------------- postgres
step "$PG_NAME from $PG_DIGEST"
POSTGRES_PASSWORD="$EYE_DB_PASSWORD" docker run -d --name "$PG_NAME" \
  -p "127.0.0.1:$PG_PORT:5432" -v "$PG_VOLUME:/var/lib/postgresql" \
  -e POSTGRES_USER="$PG_SUPERUSER" -e POSTGRES_PASSWORD -e POSTGRES_DB=postgres \
  "$PG_DIGEST" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$PG_NAME" pg_isready -U "$PG_SUPERUSER" -d postgres -q 2>/dev/null && break; sleep 1
done
docker exec "$PG_NAME" pg_isready -U "$PG_SUPERUSER" -d postgres -q || die "$PG_NAME did not become ready"
rpsq() { docker exec -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d "$1" -v ON_ERROR_STOP=1 -X -A -t -c "$2"; }
say "  ready: $(rpsq postgres 'select version()' | cut -d, -f1)"

step "pg/globals.sql (roles; the superuser already exists in the fresh cluster — that one error is expected)"
docker exec -i -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d postgres -X -q < "$BUNDLE/pg/globals.sql" > "$RROOT/work/globals.log" 2>&1 || true
GERR=$(grep -c 'ERROR' "$RROOT/work/globals.log" || true)
grep 'ERROR' "$RROOT/work/globals.log" | sed -E 's/PASSWORD.*/PASSWORD [redacted]/' | sed 's/^/    /' || true
say "  roles now: $(rpsq postgres "select string_agg(rolname, ',' order by rolname) from pg_roles where rolname not like 'pg_%'")"
check "$([[ "$GERR" -le 1 ]] && echo true || echo false)" "globals restored ($GERR error(s); at most the pre-existing superuser role)"

for db in $(jq -r '.databases[]' "$MANIFEST"); do
  step "pg_restore pg/$db.dump -> $db"
  t=$(now_s)
  rpsq postgres "create database $db owner $PG_SUPERUSER" >/dev/null
  docker exec -i -e PGPASSWORD "$PG_NAME" pg_restore -U "$PG_SUPERUSER" -d "$db" --no-password < "$BUNDLE/pg/$db.dump" > "$RROOT/work/restore-$db.log" 2>&1 && rc=0 || rc=$?
  RERR=$(grep -c 'ERROR' "$RROOT/work/restore-$db.log" || true)
  grep -E 'ERROR|WARNING' "$RROOT/work/restore-$db.log" | head -20 | sed 's/^/    /' || true
  say "  pg_restore rc=$rc errors=$RERR  $(( $(now_s) - t ))s"
  check "$([[ "$rc" -eq 0 && "$RERR" -eq 0 ]] && echo true || echo false)" "pg_restore $db completed without error"
done

# ------------------------------------------------------ vault + journal
step "vault.tar and journal.tar -> $RROOT"
tar -C "$RROOT" -xf "$BUNDLE/vault.tar"
tar -C "$RROOT" -xf "$BUNDLE/journal.tar"
VAULT="$RROOT/$(jq -r .vault.root "$MANIFEST")"
VFILES=$(find "$VAULT" -type f | wc -l | tr -d ' ')
check "$([[ "$VFILES" == "$(jq -r .vault.files "$MANIFEST")" ]] && echo true || echo false)" "vault files extracted: $VFILES (manifest $(jq -r .vault.files "$MANIFEST"))"
for d in $(jq -r '.journal[] | select(.present) | .path' "$MANIFEST"); do
  say "  journal $d: $(find "$RROOT/$d" -type f | wc -l | tr -d ' ') file(s)"
done
mkdir -p "$RROOT/apps/api/.eye-local/degraded-demo"
T_RESTORE=$(( $(now_s) - T0 ))

# ---------------------------------------------------------- verification
step "verification: schema_migrations, canonical_objects, manifests against MANIFEST.json"
for db in $(jq -r '.databases[]' "$MANIFEST"); do
  got="$(rpsq "$db" "select json_build_object(
    'schema_migrations_count', (select count(*) from public.schema_migrations),
    'last_migration',          (select max(filename) from public.schema_migrations),
    'canonical_objects',       (select count(*) from objects.canonical_objects),
    'audit_events',            (select count(*) from audit.audit_events),
    'audit_seals',             (select count(*) from audit.audit_seals),
    'integrity_incidents',     (select count(*) from audit.integrity_incidents),
    'audit_partitions',        (select count(*) from audit.audit_chain_heads),
    'blob_manifests_live',     (select count(*) from observation.blob_manifests m
                                where not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)),
    'blob_tombstones',         (select count(*) from observation.blob_tombstones))::text")"
  for key in schema_migrations_count last_migration canonical_objects audit_events audit_seals integrity_incidents audit_partitions blob_manifests_live blob_tombstones; do
    g="$(jq -r --arg k "$key" '.[$k]' <<<"$got")"
    b="$(jq -r --arg db "$db" --arg k "$key" '.database_facts.before_dump[$db][$k]' "$MANIFEST")"
    a="$(jq -r --arg db "$db" --arg k "$key" '.database_facts.after_dump[$db][$k]' "$MANIFEST")"
    if [[ "$g" == "$b" ]]; then check true "$db.$key = $g"
    elif [[ "$g" == "$a" ]]; then check true "$db.$key = $g (equals the after-dump value; the database changed during the dump window)"
    else check false "$db.$key = $g (manifest before=$b after=$a)"; fi
  done
done

step "verification: audit chain (read-only re-computation of every partition; the app's verifyChain rules, without opening incidents)"
cat > "$RROOT/work/verify-chain.mjs" <<'EOF'
// Read-only mirror of AuditService.verifyChain (apps/api/src/audit/audit.service.ts):
// contiguous seq from 1, previous_hash links, canonical JCS bytes, recomputed row hash,
// head reached, no orphan rows above the head. Uses the SAME contract functions.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { auditRowHash, jcsCanonicalize, GENESIS_HASH } = await import(pathToFileURL(join(process.env.EYE_REPO, 'packages/contracts/dist/index.js')).href);
const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const heads = lines(process.argv[2]);
const events = lines(process.argv[3]);
const manifestHeads = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const byPartition = new Map();
for (const e of events) { if (!byPartition.has(e.partition_id)) byPartition.set(e.partition_id, []); byPartition.get(e.partition_id).push(e); }
const results = [];
for (const h of heads) {
  const rows = (byPartition.get(h.partition_id) ?? []).sort((a, b) => Number(a.audit_seq) - Number(b.audit_seq));
  const headSeq = Number(h.next_seq) - 1;
  let prev = GENESIS_HASH, expected = 1, cls = 'ok', at = null;
  for (const r of rows) {
    const seq = Number(r.audit_seq);
    if (seq > headSeq) break;
    if (seq !== expected || r.previous_hash !== prev) { cls = 'chain_broken'; at = seq; break; }
    const ev = JSON.parse(r.event_jcs);
    if (r.event_jcs !== jcsCanonicalize(ev)) { cls = 'noncanonical_bytes'; at = seq; break; }
    if (auditRowHash({ partitionId: h.partition_id, auditSeq: seq, previousHash: prev, event: ev }) !== r.row_hash) { cls = 'chain_broken'; at = seq; break; }
    prev = r.row_hash; expected += 1;
  }
  const orphans = rows.filter((r) => Number(r.audit_seq) > headSeq).length;
  if (cls === 'ok' && (expected !== headSeq + 1 || h.head_hash !== prev)) cls = 'head_mismatch';
  if (cls === 'ok' && orphans > 0) cls = 'orphan_rows';
  const m = manifestHeads.find((x) => x.partition_id === h.partition_id);
  const headEqualsManifest = m !== undefined && String(m.next_seq) === String(h.next_seq) && m.head_hash === h.head_hash && m.frozen === h.frozen;
  results.push({ partition: h.partition_id, frozen: h.frozen, checked: Math.min(rows.length, headSeq), cls, at, orphans, headEqualsManifest });
}
const unknownInManifest = manifestHeads.filter((m) => !heads.some((h) => h.partition_id === m.partition_id)).length;
const summary = {
  partitions: results.length, events_checked: results.reduce((n, r) => n + r.checked, 0),
  unfrozen: results.filter((r) => !r.frozen).length, unfrozen_ok: results.filter((r) => !r.frozen && r.cls === 'ok').length,
  frozen: results.filter((r) => r.frozen).length, frozen_ok: results.filter((r) => r.frozen && r.cls === 'ok').length,
  frozen_classes: results.filter((r) => r.frozen).reduce((o, r) => ({ ...o, [r.cls]: (o[r.cls] ?? 0) + 1 }), {}),
  heads_equal_manifest: results.filter((r) => r.headEqualsManifest).length, manifest_partitions_missing: unknownInManifest,
  unfrozen_failures: results.filter((r) => !r.frozen && r.cls !== 'ok').map((r) => ({ partition: r.partition, cls: r.cls, at: r.at })),
};
console.log(JSON.stringify(summary));
EOF
for db in $(jq -r '.databases[]' "$MANIFEST"); do
  rpsq "$db" "select row_to_json(h)::text from (select partition_id, next_seq, head_hash, frozen from audit.audit_chain_heads order by partition_id) h" > "$RROOT/work/$db.heads.jsonl"
  rpsq "$db" "select row_to_json(e)::text from (select partition_id, audit_seq, event_jcs, previous_hash, row_hash from audit.audit_events order by partition_id, audit_seq) e" > "$RROOT/work/$db.events.jsonl"
  jq -c --arg db "$db" '.database_facts.before_dump[$db].audit_heads' "$MANIFEST" > "$RROOT/work/$db.manifest-heads.json"
  S="$(EYE_REPO="$REPO" node "$RROOT/work/verify-chain.mjs" "$RROOT/work/$db.heads.jsonl" "$RROOT/work/$db.events.jsonl" "$RROOT/work/$db.manifest-heads.json")"
  say "  $db: $S"
  P=$(jq -r .partitions <<<"$S"); U=$(jq -r .unfrozen <<<"$S"); UO=$(jq -r .unfrozen_ok <<<"$S"); HM=$(jq -r .heads_equal_manifest <<<"$S"); MM=$(jq -r .manifest_partitions_missing <<<"$S")
  check "$([[ "$U" == "$UO" ]] && echo true || echo false)" "$db: every unfrozen partition verifies to its head ($UO/$U; $(jq -r .events_checked <<<"$S") events re-hashed)"
  MF="$(jq -r --arg db "$db" '[.database_facts.before_dump[$db].audit_heads[] | select(.frozen)] | length' "$MANIFEST")"
  check "$([[ "$(jq -r .frozen <<<"$S")" == "$MF" ]] && echo true || echo false)" "$db: frozen partitions (with recorded integrity incidents in the source) restored as frozen: $(jq -r .frozen <<<"$S") (manifest $MF)"
  if [[ "$HM" == "$P" && "$MM" == "0" ]]; then check true "$db: all $P chain heads equal the manifest"
  else
    A="$(jq -r --arg db "$db" '.database_facts.after_dump[$db].audit_heads' "$MANIFEST")"
    if [[ "$(jq -cS . "$RROOT/work/$db.heads.jsonl" | jq -cs 'sort_by(.partition_id)')" == "$(jq -c 'sort_by(.partition_id) | map({partition_id,next_seq,head_hash,frozen})' <<<"$A" | jq -cS .)" ]]; then
      check true "$db: chain heads equal the manifest's after-dump heads ($P partitions; the ledger advanced during the dump window)"
    else check false "$db: chain heads differ from the manifest ($HM/$P equal, $MM missing)"; fi
  fi
  # ADR-P0-09: heads are never trusted from backup alone. Compute what
  # audit.rebuild_chain_heads() WOULD write, without writing it.
  RB="$(rpsq "$db" "select count(*) from audit.audit_chain_heads h left join (select partition_id, max(audit_seq) mx, (array_agg(row_hash order by audit_seq desc))[1] lh from audit.audit_events group by 1) e using (partition_id) where not h.frozen and (h.next_seq <> coalesce(e.mx,0)+1 or h.head_hash <> coalesce(e.lh, repeat('0',64)))")"
  check "$([[ "$RB" == "0" ]] && echo true || echo false)" "$db: audit.rebuild_chain_heads() would change 0 unfrozen heads ($RB) — the heads are consistent with the ledger"
done

step "verification: every live (non-tombstoned) blob manifest has its bytes in the restored vault with the recorded sha256 (ALL rows)"
cat > "$RROOT/work/verify-blobs.mjs" <<'EOF'
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [vaultRoot, tsv] = process.argv.slice(2);
const c = { total: 0, present_verified: 0, absent: 0, digest_mismatch: 0, length_mismatch: 0, by_vault: {} };
for (const line of readFileSync(tsv, 'utf8').split('\n').filter(Boolean)) {
  const [vault, locator, digest, bytes] = line.split('\t');
  c.total += 1; c.by_vault[vault] = c.by_vault[vault] ?? { total: 0, present_verified: 0, absent: 0 }; c.by_vault[vault].total += 1;
  const p = join(vaultRoot, vault, locator);
  let buf; try { buf = readFileSync(p); } catch { c.absent += 1; c.by_vault[vault].absent += 1; continue; }
  if (createHash('sha256').update(buf).digest('hex') !== digest) { c.digest_mismatch += 1; continue; }
  if (buf.length !== Number(bytes)) { c.length_mismatch += 1; continue; }
  c.present_verified += 1; c.by_vault[vault].present_verified += 1;
}
console.log(JSON.stringify(c));
EOF
for db in $(jq -r '.databases[]' "$MANIFEST"); do
  docker exec -e PGPASSWORD "$PG_NAME" psql -U "$PG_SUPERUSER" -d "$db" -v ON_ERROR_STOP=1 -X -A -t -F "$(printf '\t')" -c \
    "select vault, locator, content_digest, byte_length from observation.blob_manifests m
     where not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id) order by created_at" > "$RROOT/work/$db.manifests.tsv"
  S="$(node "$RROOT/work/verify-blobs.mjs" "$VAULT" "$RROOT/work/$db.manifests.tsv")"
  say "  $db: $S"
  T=$(jq -r .total <<<"$S"); V=$(jq -r .present_verified <<<"$S"); A=$(jq -r .absent <<<"$S"); DM=$(jq -r .digest_mismatch <<<"$S"); LM=$(jq -r .length_mismatch <<<"$S")
  if echo " $STRICT_BLOB_DBS " | grep -q " $db "; then
    check "$([[ "$T" == "$V" ]] && echo true || echo false)" "$db: $V/$T live manifests have their bytes with the recorded sha256 (absent=$A digest_mismatch=$DM length_mismatch=$LM)"
  else
    check "$([[ "$DM" == "0" && "$LM" == "0" ]] && echo true || echo false)" "$db: no corrupt bytes ($V/$T present and verified; absent=$A — the harness database's blobs were written to per-test temporary vault roots, see the runbook)"
  fi
done

step "verification: vault.tar and journal.tar sha256 equal the manifest (re-checked after extraction)"
for f in vault.tar journal.tar; do
  check "$([[ "$(sha "$BUNDLE/$f")" == "$(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")" ]] && echo true || echo false)" "$f sha256 = $(jq -r --arg f "$f" '.files[$f].sha256' "$MANIFEST")"
done
T_VERIFY=$(( $(now_s) - T0 - T_RESTORE ))

# ------------------------------------------------------------ second API
step "$REDIS_NAME from $REDIS_DIGEST (empty — no Redis state is restored)"
# The password reaches the container only as docker environment (never on a command line).
export REDIS_PASSWORD="$EYE_REDIS_PASSWORD"
docker run -d --name "$REDIS_NAME" -p "127.0.0.1:$REDIS_PORT:6379" -e REDIS_PASSWORD \
  "$REDIS_DIGEST" sh -c 'exec redis-server --requirepass "$REDIS_PASSWORD"' >/dev/null
for _ in $(seq 1 30); do docker exec -e REDIS_PASSWORD "$REDIS_NAME" sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null' | grep -q PONG && break; sleep 1; done
say "  keys in the fresh redis: $(docker exec -e REDIS_PASSWORD "$REDIS_NAME" sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning dbsize 2>/dev/null')"

step "second API: apps/api/dist/main.js on :$API_PORT against $API_DB@127.0.0.1:$PG_PORT, vault+journal under $RROOT, scheduler disabled"
API_PID=$(cd "$REPO/apps/api" && {
  EYE_DB_HOST=127.0.0.1 EYE_DB_PORT="$PG_PORT" EYE_DB_NAME="$API_DB" \
  EYE_REDIS_HOST=127.0.0.1 EYE_REDIS_PORT="$REDIS_PORT" \
  EYE_RUNTIME_PORT="$API_PORT" EYE_SCHEDULER_ENABLED=false \
  EYE_VAULT_QUARANTINE_ROOT="$VAULT/quarantine" EYE_VAULT_EVIDENCE_ROOT="$VAULT/evidence" \
  EYE_DEGRADED_DIR="$RROOT/apps/api/.eye-local/degraded-demo" \
  node dist/main.js > "$RROOT/api.log" 2>&1 & echo $!; })
READY=""
for _ in $(seq 1 60); do
  READY="$(curl -sf "http://127.0.0.1:$API_PORT/readyz" 2>/dev/null || true)"; [[ -n "$READY" ]] && break; sleep 1
done
say "  $(grep -m1 'listening on' "$RROOT/api.log" || echo 'no listening line yet')"
ESC="$(printf '\033')"
say "  $(grep -m1 'scheduler disabled' "$RROOT/api.log" | sed -E "s/$ESC\[[0-9;]*m//g" | sed -E 's/^.*(scheduler disabled.*)$/\1/' || true)"
say "  /readyz: $READY"
check "$([[ "$(jq -r .status <<<"${READY:-{}}" 2>/dev/null)" == "ok" ]] && echo true || echo false)" "/readyz status ok (db=$(jq -r .db <<<"${READY:-{}}" 2>/dev/null) audit=$(jq -r .audit <<<"${READY:-{}}" 2>/dev/null))"

step "governed read through the restored API (login -> evidence list -> one evidence download re-verified against the restored vault)"
cat > "$RROOT/work/probe.mjs" <<'EOF'
// Reads only. Credentials come from the process environment (the restored config copy) and are never printed.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { call, login, demoScope } = await import(pathToFileURL(join(process.env.EYE_REPO, 'scripts/phase4/governed.mjs')).href);
const PW = process.env.EYE_TEST_ADMIN_PASSWORD;
const out = { api: process.env.EYE_API };
const admin = await login('platform-admin', PW);
if (admin === null) { console.log(JSON.stringify({ ...out, ok: false, at: 'admin login' })); process.exit(1); }
const scope = await demoScope(admin);
out.tenant = scope.tenantId.slice(0, 8) + '…'; out.domain = scope.domainId.slice(0, 8) + '…';
const member = await login('m.dvorak', PW);
if (member === null) { console.log(JSON.stringify({ ...out, ok: false, at: 'member login' })); process.exit(1); }
const X = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const as = (a, t, id = null) => ({ scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: a, objectType: t, objectId: id, principalId: `principal:${member.principalId}`, purposeId: 'observation' });
const list = await call(`${X}/evidence/list`, as('observation.read.evidence', 'EVD'), { limit: 20 }, member.token);
out.list = { status: list.status, evidence: (list.body.evidence ?? []).length };
if (!list.ok || out.list.evidence === 0) { console.log(JSON.stringify({ ...out, ok: false, at: 'evidence list' })); process.exit(1); }
const first = list.body.evidence[0];
const dl = await call(`${X}/evidence/${first.object_id}/download`, as('observation.evidence.retrieve', 'EVD', first.object_id), {}, member.token);
const d = dl.body.download ?? {};
const b64 = d.base64 ?? dl.body.base64;
const digestOfBytes = b64 ? createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex') : null;
out.download = { status: dl.status, evd: first.object_id.slice(0, 8) + '…', byteLength: d.byteLength ?? null, contentDigest: (d.contentDigest ?? '').slice(0, 16) + '…', bytesHashToDigest: digestOfBytes !== null ? digestOfBytes === d.contentDigest : null, integrity: d.integrity ?? dl.body.integrity ?? null };
out.ok = dl.ok && (digestOfBytes === null || digestOfBytes === d.contentDigest);
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
EOF
PROBE_RC=0
PROBE="$(EYE_REPO="$REPO" EYE_API="http://127.0.0.1:$API_PORT" node "$RROOT/work/probe.mjs" 2>&1)" || PROBE_RC=$?
say "  $PROBE"
check "$([[ "$PROBE_RC" -eq 0 ]] && echo true || echo false)" "governed read: login as demo member, evidence list, evidence download with digest re-verified"

# ------------------------------------------------------------- summary
T_TOTAL=$(( $(now_s) - T0 ))
step "summary"
say "  restore (postgres start + globals + pg_restore x2 + tar extract): ${T_RESTORE}s"
say "  verification: ${T_VERIFY}s   total including second API and probe: ${T_TOTAL}s"
say "  checks: $PASS passed, $FAIL failed"
jq -n --arg b "$BUNDLE" --arg r "$RROOT" --argjson pass "$PASS" --argjson fail "$FAIL" \
  --argjson tr "$T_RESTORE" --argjson tv "$T_VERIFY" --argjson tt "$T_TOTAL" \
  '{bundle:$b, restore_root:$r, checks:{passed:$pass, failed:$fail}, seconds:{restore:$tr, verify:$tv, total:$tt}}' > "$RROOT/RESTORE_REPORT.json"
[[ "$FAIL" -eq 0 ]] || die "$FAIL verification check(s) failed — see above"
say "  RESTORE VERIFIED"
