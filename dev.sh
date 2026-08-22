#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
API_DIR="$BACKEND_DIR/Origin.Api"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

BACKEND_PORT=5291
FRONTEND_PORT=3000

for cmd in docker dotnet pnpm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required command: $cmd" >&2; exit 1; }
done

pids=()
cleaned_up=0

# Nuxt/Vite spawn worker processes that can outlive a tree-kill of the
# subshell PID, so as a fallback also kill whatever is bound to the dev
# ports directly.
kill_by_port() {
  local port="$1"
  command -v netstat >/dev/null 2>&1 || return 0
  local pid
  for pid in $(netstat -ano -p tcp 2>/dev/null | awk -v p=":$port\$" '$2 ~ p && $4=="LISTENING" {print $5}' | sort -u); do
    taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
  done
}

cleanup() {
  [[ "$cleaned_up" -eq 1 ]] && return
  cleaned_up=1

  echo
  echo "Stopping backend and frontend..."
  for pid in "${pids[@]:-}"; do
    [[ -z "${pid:-}" ]] && continue
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  done
  kill_by_port "$BACKEND_PORT"
  kill_by_port "$FRONTEND_PORT"

  echo "Stopping docker services..."
  (cd "$BACKEND_DIR" && docker compose down) || true
}
trap cleanup EXIT INT TERM

echo "Starting Postgres + MinIO..."
(cd "$BACKEND_DIR" && docker compose up -d)

echo "Waiting for Postgres..."
until (cd "$BACKEND_DIR" && docker compose exec -T postgres pg_isready -U origin >/dev/null 2>&1); do
  sleep 1
done

echo "Starting backend API..."
(cd "$API_DIR" && dotnet run 2>&1 | sed -u 's/^/[backend] /') &
pids+=($!)

echo "Starting frontend..."
(cd "$FRONTEND_DIR" && pnpm run dev 2>&1 | sed -u 's/^/[frontend] /') &
pids+=($!)

wait
