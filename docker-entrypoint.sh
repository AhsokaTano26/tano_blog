#!/bin/bash
set -e

# ==========================================
# Tano Blog — Docker Entrypoint
# Starts both the Go API and Next.js frontend
# ==========================================

echo "═══════════════════════════════════════"
echo "  Tano Blog — Starting services"
echo "═══════════════════════════════════════"

# Install traps before starting either child, including during health polling.
GO_PID=
NEXT_PID=
stop_children() {
  trap '' SIGINT SIGTERM
  for pid in "$GO_PID" "$NEXT_PID"; do
    if [ -n "$pid" ]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  for pid in "$GO_PID" "$NEXT_PID"; do
    if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
  done
}
shutdown() {
  echo "Shutting down..."
  stop_children
  exit 0
}
trap shutdown SIGINT SIGTERM

# Bash 3 and 5 compatible: preserve the failed child's status and drain its
# sibling. Polling also detects failures while the health check is pending.
check_children() {
  for pid in "$GO_PID" "$NEXT_PID"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      status=0
      wait "$pid" || status=$?
      stop_children
      exit "$status"
    fi
  done
}

# Start Go backend (port 8080 by default)
echo "[backend] Starting Go API on :${SERVER_PORT:-8080} ..."
/app/server &
GO_PID=$!

# Start Next.js standalone (port 3000)
echo "[frontend] Starting Next.js on :3000 ..."
cd /app/next
PORT=3000 HOSTNAME=0.0.0.0 node server.js &
NEXT_PID=$!
cd /app

# Health polling: wait for both services to be ready
echo "[health] Waiting for services to start..."
for i in $(seq 1 30); do
  check_children
  GO_OK=0
  wget --no-verbose --timeout=2 --tries=1 --spider http://localhost:${SERVER_PORT:-8080}/health > /dev/null 2>&1 && GO_OK=1
  if [ "$GO_OK" = "1" ]; then
    echo "[health] Backend API is ready"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "[health] WARNING: Backend API did not start in time"
  fi
  sleep 1
done

echo "═══════════════════════════════════════"
echo "  Tano Blog — Ready"
echo "  Frontend : http://localhost:3000"
echo "  API      : http://localhost:${SERVER_PORT:-8080}"
echo "═══════════════════════════════════════"

while true; do
  check_children
  sleep 1
done
