#!/bin/bash
# Runs the investing acceptance tests against a local database built by supabase/investing/rebuild_local.sh.
# Usage: tests/investing/run.sh [dbname]     (PGHOST/PGPORT/PGUSER as usual)
set -o pipefail
DB=${1:-iris_local}
HERE="$(cd "$(dirname "$0")" && pwd)"
out=$(psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/phase1_tests.sql" 2>&1)
rc=$?
out2=$(psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/phase2_md_tests.sql" 2>&1)
rc2=$?
out="$out"$'\n'"$out2"; [ $rc2 -ne 0 ] && rc=$rc2
echo "$out" | grep -E 'PASS|SKIP|FAIL|ERROR' | sed 's/^psql:.*NOTICE:  //; s/^NOTICE:  //'
pass=$(echo "$out" | grep -c 'PASS'); fail=$(echo "$out" | grep -c -E 'FAIL|ERROR')
echo "-- $pass passed, $fail failed (rc=$rc)"
[ $rc -eq 0 ] && [ $fail -eq 0 ]
