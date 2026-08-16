#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Reap stale O.D.C processes from a previous run of this script ----------
# Matches only processes whose command line points inside our own directories,
# so unrelated apps on the same ports are never touched.
reap_stale() {
  local pid cwd
  for port in 4000 5173; do
    if [ -z "$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null)" ]; then
      continue
    fi
    for pid in $(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null); do
      # lsof -d cwd reports the process's working directory
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
      case "$cwd" in
        "$ROOT"/*|"$ROOT")
          echo "Port $port is held by an earlier O.D.C instance (pid $pid) — stopping it."
          kill "$pid" 2>/dev/null || true
          ;;
        *)
          echo "ERROR: Port $port is already in use by another app (pid $pid)."
          echo "       Please close that app or free the port, then run again."
          echo "       Working dir: ${cwd:-<unknown>}"
          exit 1
          ;;
      esac
    done
  done
}

# Persisted API data is safe; just give ports a moment to release.
reap_stale
sleep 1

if [ ! -d "$ROOT/server/node_modules" ]; then
  echo "Installing server dependencies…"
  (cd "$ROOT/server" && npm install --no-audit --no-fund)
fi

if [ ! -d "$ROOT/client/node_modules" ]; then
  echo "Installing client dependencies…"
  (cd "$ROOT/client" && npm install --no-audit --no-fund)
fi

echo
echo "Starting O.D.C API on :4000 …"
(cd "$ROOT/server" && npm start) &
SERVER_PID=$!

echo "Starting O.D.C web app on :5173 …"
(cd "$ROOT/client" && npm run dev) &
CLIENT_PID=$!

cleanup() {
  echo
  echo "Stopping O.D.C…"
  kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true
  wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo
echo "──────────────────────────────"
echo "  O.D.C is running"
echo "  Web app : http://localhost:5173"
echo "  API     : http://localhost:4000"
echo "──────────────────────────────"
echo "  Super Admin (private): http://localhost:4000/tail/z7k9x2/admin/home"
echo "  First-run admin email/password are printed in the server log above."
echo "  Press Ctrl-C to stop both servers."
echo

wait -n "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || wait "$SERVER_PID" "$CLIENT_PID"
cleanup