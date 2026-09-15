#!/usr/bin/env bash
# Sync registry/*.yaml into the database so the command center can read it alongside
# everything else. Git is the source of truth; iris.projects is a cache of it.
#
# Run by CI on merge to main. Refuses to run without an explicit target, because the only
# database this should ever touch is the one the owner points it at.
#
#   DATABASE_URL=... ./tools/sync-registry.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to the target database}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v python3 >/dev/null || { echo "python3 required" >&2; exit 2; }

python3 - "$ROOT" <<'PY' > /tmp/registry.sql
import sys, yaml, json
root = sys.argv[1]
p = yaml.safe_load(open(f"{root}/registry/projects.yaml"))
a = yaml.safe_load(open(f"{root}/registry/agents.yaml"))
def lit(v): return "null" if v is None else "'" + str(v).replace("'", "''") + "'"
print("begin;")
print("create table if not exists iris.projects (key text primary key, name text not null, status text not null, summary text, repo text, site text, schemas text[], synced_at timestamptz not null default now());")
print("create temp table _keep(key text);")
for x in p["projects"]:
    schemas = "array[" + ",".join(lit(s) for s in (x.get("schemas") or [])) + "]::text[]"
    print(f"insert into _keep values ({lit(x['key'])});")
    print(
        "insert into iris.projects (key,name,status,summary,repo,site,schemas,synced_at) values ("
        f"{lit(x['key'])},{lit(x['name'])},{lit(x['status'])},{lit(x.get('summary'))},"
        f"{lit(x.get('repo'))},{lit(x.get('site'))},{schemas},now()) "
        "on conflict (key) do update set name=excluded.name, status=excluded.status, "
        "summary=excluded.summary, repo=excluded.repo, site=excluded.site, "
        "schemas=excluded.schemas, synced_at=now();"
    )
# A project removed from the YAML is removed from the UI. That is the point of a single list.
print("delete from iris.projects where key not in (select key from _keep);")
print("commit;")
PY

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/registry.sql
rm -f /tmp/registry.sql
echo "registry synced"
