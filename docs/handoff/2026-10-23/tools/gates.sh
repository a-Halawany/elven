#!/bin/bash
# usage: gates.sh <worktree> <label> <redis-port> — build, unit, web, boundaries; then (under the host lock) integration on a fresh DB, acceptance, upgrade
W=$1; L=$2; RP=$3; S=/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/410dc92c-9357-4f51-bd03-84dce11e3661/scratchpad/gate/$L; mkdir -p $S
cd $W; set -a; . /Users/halawany/work/personal/mohammed/new_project/.eye-local/env; set +a
echo "head $(git rev-parse --short HEAD)"
RC=$(docker ps --filter publish=$RP --format "{{.Names}}" | head -1); RPW=$(docker inspect $RC --format "{{index .Config.Cmd 2}}"); docker exec $RC redis-cli -a "$RPW" --no-auth-warning FLUSHALL >/dev/null && echo "redis $RC flushed"
pnpm build > $S/build.log 2>&1; echo "build: $?"
node scripts/license-inventory.mjs > /dev/null 2>&1
(cd apps/api && pnpm test > $S/unit.log 2>&1; echo "unit: $(/usr/bin/grep -E '^ +Tests ' $S/unit.log | head -2 | tr '\n' ' ')")
(cd apps/web && pnpm test > $S/web.log 2>&1; echo "web: $(/usr/bin/grep -E '^ +Tests ' $S/web.log | head -1)")
pnpm boundaries > $S/boundaries.log 2>&1; echo "boundaries: $?"
D=eye_verify_a1_${L}_gate
EYE_HEAVY_SLOTS=1 scripts/dev/heavy-slot.sh $L-int -- bash -c "docker exec eye-postgres dropdb -U eye --if-exists $D >/dev/null 2>&1; docker exec eye-postgres createdb -U eye $D && cd apps/api && EYE_REDIS_PORT=$RP EYE_DB_NAME=$D pnpm db:migrate > $S/migrate.log 2>&1 && EYE_REDIS_PORT=$RP EYE_DB_NAME=$D npx vitest run --config vitest.int.config.ts > $S/int.log 2>&1; EYE_REDIS_PORT=$RP EYE_DB_NAME=$D pnpm run test:accept > $S/accept.log 2>&1; docker exec eye-postgres dropdb -U eye --if-exists $D" > /dev/null 2>&1
echo "int: $(/usr/bin/grep -E '^ +(Test Files|Tests) ' $S/int.log | tr '\n' ' ') $(/usr/bin/grep Duration $S/int.log)"
echo "accept: $(/usr/bin/grep -E '^ +Tests ' $S/accept.log | head -1)"
EYE_HEAVY_SLOTS=1 scripts/dev/heavy-slot.sh $L-upgrade -- node scripts/phase1/verify-0022-upgrade.mjs > $S/upgrade.log 2>&1; echo "upgrade: $(/usr/bin/grep -E 'PASS|FAIL' $S/upgrade.log | tail -1)"
