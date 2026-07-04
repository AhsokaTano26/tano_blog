#!/bin/sh
set -e

# ==========================================
# Tano Blog — Docker Entrypoint
# Starts both the Go API and Next.js frontend
# ==========================================

echo "═══════════════════════════════════════"
echo "  Tano Blog — Starting services"
echo "═══════════════════════════════════════"

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
  GO_OK=0
  wget --no-verbose --tries=1 --spider http://localhost:${SERVER_PORT:-8080}/health > /dev/null 2>&1 && GO_OK=1
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

# Forward signals to child processes
trap "echo 'Shutting down...'; kill $GO_PID $NEXT_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Exit when any process dies
wait
