#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/marketonline}"
export PGSSLMODE="${PGSSLMODE:-disable}"
export PORT="${PORT:-8000}"

if ! command -v npm >/dev/null 2>&1; then
  echo "[OpenMarket] npm is not available in this WSL session."
  echo "[OpenMarket] Install Node.js and npm, then run the script again."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[OpenMarket] psql is not available in this WSL session."
  echo "[OpenMarket] Install the PostgreSQL client or make sure it is in PATH."
  exit 1
fi

DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"

if ! psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "[OpenMarket] PostgreSQL connection failed for:"
  echo "  $DATABASE_URL"
  echo "[OpenMarket] Make sure PostgreSQL is running and the database exists."
  echo "[OpenMarket] Example:"
  echo "  createdb -U postgres $DB_NAME"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[OpenMarket] Installing dependencies..."
  npm install
fi

echo "[OpenMarket] Starting app on http://localhost:${PORT}"
exec npm start
