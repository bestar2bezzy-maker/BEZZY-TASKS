#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="${DB_PATH:-$ROOT/data/bezzy-tasks.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [ ! -f "$DB_PATH" ]; then echo "Database not found: $DB_PATH" >&2; exit 1; fi
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/bezzy-tasks-$STAMP.sqlite'"
find "$BACKUP_DIR" -type f -name 'bezzy-tasks-*.sqlite' -mtime +14 -delete
printf '%s\n' "$BACKUP_DIR/bezzy-tasks-$STAMP.sqlite"
