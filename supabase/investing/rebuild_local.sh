#!/bin/bash
# Rebuild a local database from the exported layer plus every migration, in order. Usage: ./rebuild_local.sh [dbname]
set -e
DB=${1:-iris_local}
HERE="$(cd "$(dirname "$0")" && pwd)"
psql -qc "drop database if exists $DB" postgres
psql -qc "create database $DB" postgres
for f in schema_investing.sql local_stubs.sql functions_investing.sql seed_investing.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -1 -f "$HERE/$f" 2>&1 | grep -v NOTICE || true
done
for f in "$HERE"/migrations/*.sql; do
  echo "== $(basename "$f")"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -1 -f "$f" 2>&1 | grep -v NOTICE || true
done
echo "rebuilt $DB"
