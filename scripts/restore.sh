#!/bin/sh
set -eu
backup=${1:?usage: CONFIRM_RESTORE=YES restore.sh /absolute/file.dump}
test "${CONFIRM_RESTORE:-}" = YES || { echo "restore confirmation missing" >&2; exit 2; }
case "$backup" in /*) ;; *) echo "backup path must be absolute" >&2; exit 2;; esac
test -s "$backup"
docker compose exec -T db psql -U futurex -d futurex -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
docker compose exec -T db pg_restore -U futurex -d futurex --clean --if-exists --no-owner --exit-on-error < "$backup"
