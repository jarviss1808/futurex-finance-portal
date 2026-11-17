#!/bin/sh
set -eu
dest=${1:?usage: backup.sh /absolute/backup/directory}
case "$dest" in /*) ;; *) echo "backup directory must be absolute" >&2; exit 2;; esac
mkdir -p "$dest"
stamp=$(date -u +%Y%m%d-%H%M%S)
tmp="$dest/.futurex-$stamp.dump.tmp"
final="$dest/futurex-$stamp.dump"
trap 'rm -f "$tmp"' EXIT
docker compose exec -T db pg_dump -U futurex -d futurex -Fc > "$tmp"
test -s "$tmp"
mv "$tmp" "$final"
trap - EXIT
echo "$final"
